import { describe, expect, it } from 'vitest'
import { SAMPLE_DECK_ITEMS } from '../pdf/fixtures/sampleDeckItems.ts'
import { buildPageText } from '../pdf/textIndex.ts'
import { analyzePage, maskedRects } from './analyzePage.ts'
import { SAMPLE_DECK_NER } from './fixtures/sampleDeckNer.ts'
import { joinLineBreaks, nerDetections, valueKey } from './merge.ts'
import { aggregateEntities } from './ner.ts'
import { buildReview } from './review.ts'

// The whole pipeline on the fictional deck: its real layout, the model's
// real output, the line-break join, then the review.
const pageTexts = SAMPLE_DECK_ITEMS.map((page, i) =>
  buildPageText(
    page.items.map(([str, transform, width, height, hasEOL]) => ({ str, transform, width, height, hasEOL })),
    page,
    i + 1,
  ),
)
const entities = pageTexts.map((page, i) =>
  joinLineBreaks(
    page,
    aggregateEntities(page.text, SAMPLE_DECK_NER[i].map(([word, entity, score]) => ({ word, entity, score }))),
  ),
)
const found = nerDetections(
  pageTexts.map((page) => page.text),
  entities,
)
const pages = pageTexts.map((page, i) => analyzePage(page, found[i]))
const review = buildReview(pages)
const rows = (label: string) =>
  review.groups.find((group) => group.label === label)?.rows.map((row) => row.value) ?? []

describe('joinLineBreaks on the sample deck', () => {
  it('joins an organization name set on two lines of one logo', () => {
    // Page 5: "Brightwater" / "Logistics", "Castellane" / "Transports".
    const values = entities[4].map((e) => e.value)
    expect(values).toContain('Brightwater Logistics')
    expect(values).toContain('Castellane Transports')
    expect(values).not.toContain('Brightwater')
    expect(values).not.toContain('Transports')
  })

  it('never joins the footer to the line above it', () => {
    // Page 7: "Aurigny Haulage" (11 pt) above the footer "Nimbalo" (9 pt).
    const values = entities[6].map((e) => e.value)
    expect(values).toContain('Aurigny Haulage')
    expect(values).toContain('Nimbalo')
  })

  it('does not join two lines that are not stacked', () => {
    // Page 5: "Logistics" is followed by "Fenwick & Hale", in the next column.
    expect(entities[4].map((e) => e.value)).toContain('Fenwick & Hale')
  })
})

describe('buildReview on the sample deck', () => {
  it('gives one row per entity, not per fragment', () => {
    expect(rows('People')).toEqual(['Claire Dubois', 'Julia Moreau', 'Marcus Okafor', 'Priya Raman', 'Tom Whitfield'])
    const organizations = rows('Organizations')
    expect(organizations).toEqual(
      expect.arrayContaining(['Brightwater Logistics', 'Castellane Transports', 'Nimbalo SAS']),
    )
    for (const fragment of ['Brightwater', 'Logistics', 'Castellane', 'Transports', 'Nimbalo', 'Claire']) {
      expect([...organizations, ...rows('People')]).not.toContain(fragment)
    }
  })

  it('attaches "Nimbalo", first seen as a person, to "Nimbalo SAS" in Organizations', () => {
    expect(review.rowsOf('nimbalo')).toEqual(['nimbalo sas'])
  })

  it('counts a lone first name in its parent row', () => {
    // Claire Dubois on pages 1 and 7, "Claire" alone on page 9.
    const claire = review.groups.flatMap((g) => g.rows).find((row) => row.value === 'Claire Dubois')
    expect(claire?.count).toBe(3)
  })

  it('keeps a lone fragment masked while its row is checked, unmasks it with the row', () => {
    const page9 = pages[8]
    const claireZone = page9.zones.find((zone) => zone.key === 'claire')
    expect(claireZone).toBeDefined()
    const isMasked = (unmasked: Set<string>) => (key: string) =>
      !review.rowsOf(key).every((row) => unmasked.has(row))
    expect(maskedRects(page9, isMasked(new Set()))).toContainEqual(claireZone!.rect)
    expect(maskedRects(page9, isMasked(new Set([valueKey('Claire Dubois')])))).not.toContainEqual(
      claireZone!.rect,
    )
  })

  it('leaves rule groups as they were', () => {
    expect(rows('Emails')).toHaveLength(4)
    expect(rows('Phones')).toHaveLength(3)
  })
})
