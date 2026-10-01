import { describe, expect, it } from 'vitest'
import { SAMPLE_DECK_PAGES } from './fixtures/sampleDeck.ts'
import { SAMPLE_DECK_NER } from './fixtures/sampleDeckNer.ts'
import {
  findOccurrences,
  mergeDetections,
  nerDetections,
  termDetections,
  valueKey,
  type Detection,
} from './merge.ts'
import { aggregateEntities } from './ner.ts'

describe('findOccurrences', () => {
  it('matches whole words only, ignoring case', () => {
    const text = 'Hale and hale, not Whale or Haley'
    expect(findOccurrences(text, 'Hale').map((o) => text.slice(o.start, o.end))).toEqual(['Hale', 'hale'])
  })

  it('matches across a line break', () => {
    const text = 'Castellane\nTransports'
    expect(findOccurrences(text, 'Castellane Transports')).toEqual([{ start: 0, end: 21 }])
  })

  it('escapes special characters in the value', () => {
    const text = 'Fenwick & Hale (UK) and Fenwick'
    expect(findOccurrences(text, 'Fenwick & Hale')).toEqual([{ start: 0, end: 14 }])
    expect(findOccurrences('a.b', 'a+b')).toEqual([])
  })
})

describe('nerDetections on the sample deck', () => {
  // Entities from the model's real output on each page.
  const entities = SAMPLE_DECK_PAGES.map((text, i) =>
    aggregateEntities(
      text,
      SAMPLE_DECK_NER[i].map(([word, entity, score]) => ({ word, entity, score })),
    ),
  )
  const detections = nerDetections(SAMPLE_DECK_PAGES, entities)
  const found = (n: number) =>
    detections[n - 1].map((d) => SAMPLE_DECK_PAGES[n - 1].slice(d.start, d.end))

  it('masks Nimbalo on pages where the model missed it', () => {
    // The model finds no entity on pages 4 and 6, and misses the footer on
    // page 8; all three footers say Nimbalo.
    expect(found(4)).toEqual(['Nimbalo'])
    expect(found(6)).toEqual(['Nimbalo'])
    expect(found(8)).toContain('Nimbalo')
  })

  it('masks every occurrence of a person found on another page', () => {
    // Page 1 holds Claire Dubois; the model also found "Claire" on page 9.
    expect(found(1)).toEqual(expect.arrayContaining(['Claire Dubois', 'Claire']))
    expect(found(9)).toContain('Claire')
  })

  it('masks every Nimbalo on page 9, including inside the email', () => {
    const text = SAMPLE_DECK_PAGES[8]
    const nimbalos = detections[8].filter((d) => d.value.toLowerCase() === 'nimbalo')
    expect(nimbalos).toHaveLength(text.match(/nimbalo/gi)!.length)
  })

  it('keeps each value with the type the model gave it first', () => {
    const nimbalo = detections.flat().filter((d) => d.value === 'Nimbalo')
    expect(new Set(nimbalo.map((d) => d.type)).size).toBe(1)
  })
})

describe('mergeDetections', () => {
  const d = (type: Detection['type'], start: number, end: number, value = ''): Detection => ({
    type,
    value,
    start,
    end,
  })

  it('keeps a detection inside a longer one, so it stays masked on its own', () => {
    // "nimbalo" (NER) inside "invest@nimbalo.io" (rule).
    const email = d('email', 20, 37, 'invest@nimbalo.io')
    const name = d('organization', 27, 34, 'nimbalo')
    expect(mergeDetections([email], [name])).toEqual([email, name])
  })

  it('drops exact duplicates of the same value', () => {
    expect(mergeDetections([d('person', 0, 13, 'Claire Dubois')], [d('person', 0, 13, 'claire  dubois')])).toEqual([
      d('person', 0, 13, 'Claire Dubois'),
    ])
  })

  it('keeps partial overlaps and sorts by position', () => {
    expect(mergeDetections([d('person', 10, 20)], [d('organization', 15, 30), d('amount', 0, 3)])).toEqual([
      d('amount', 0, 3),
      d('person', 10, 20),
      d('organization', 15, 30),
    ])
  })
})

describe('valueKey', () => {
  it('ignores case and whitespace differences', () => {
    expect(valueKey(' Castellane\nTransports ')).toBe(valueKey('castellane transports'))
  })
})

describe('termDetections', () => {
  it('finds a custom term on every page, ignoring case, on word limits', () => {
    // The model never flags the "MO" initials on page 7.
    const found = termDetections(SAMPLE_DECK_PAGES, ['mo'])
    expect(found.map((page) => page.length)).toEqual([0, 0, 0, 0, 0, 0, 1, 0, 0])
    const [mo] = found[6]
    expect(mo).toMatchObject({ type: 'custom', value: 'mo' })
    expect(SAMPLE_DECK_PAGES[6].slice(mo.start, mo.end)).toBe('MO')
  })

  it('does not match inside a longer word', () => {
    // "Castellane" appears on page 5 only as a whole word; "Castel" never.
    expect(termDetections(SAMPLE_DECK_PAGES, ['Castel']).flat()).toEqual([])
  })
})
