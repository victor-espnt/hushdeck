import { describe, expect, it } from 'vitest'
import { SAMPLE_DECK_PAGES } from './fixtures/sampleDeck.ts'
import { SAMPLE_DECK_NER } from './fixtures/sampleDeckNer.ts'
import { findOccurrences, nerDetections } from './merge.ts'
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
    // The model finds no entity on pages 4 and 6; their footers say Nimbalo.
    expect(found(4)).toEqual(['Nimbalo'])
    expect(found(6)).toEqual(['Nimbalo'])
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
