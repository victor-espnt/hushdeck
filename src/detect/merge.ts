import { blockAt, blockRect, type PageText } from '../pdf/textIndex.ts'
import type { NerEntity, NerType } from './ner.ts'
import type { RuleType } from './rules.ts'

// 'custom': a term the user asked to mask.
export type DetectionType = RuleType | NerType | 'custom'

// A sensitive value found at [start, end) in a page string.
export type Detection = {
  type: DetectionType
  value: string
  start: number
  end: number
}

const WORD_CHAR = String.raw`[\p{L}\p{M}\p{N}]`

// Every occurrence of `value` in a page string, as a whole word, ignoring
// case, with any run of whitespace (line breaks included) between words.
export function findOccurrences(text: string, value: string): { start: number; end: number }[] {
  const words = value.trim().split(/\s+/).filter(Boolean)
  if (words.length === 0) return []
  const body = words.map((word) => word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join(String.raw`\s+`)
  const pattern = new RegExp(`(?<!${WORD_CHAR})${body}(?!${WORD_CHAR})`, 'giu')
  return Array.from(text.matchAll(pattern), (m) => ({ start: m.index, end: m.index + m[0].length }))
}

// Two detections with the same key are the same value: they are masked or
// unmasked together.
export function valueKey(value: string): string {
  return value.replace(/\s+/g, ' ').trim().toLowerCase()
}

// A NER entity is a value: it is masked wherever it occurs in the deck,
// including pages where the model missed it.
export function nerDetections(pageTexts: string[], entitiesPerPage: NerEntity[][]): Detection[][] {
  const values = new Map<string, NerEntity>()
  for (const entity of entitiesPerPage.flat()) {
    const key = valueKey(entity.value)
    if (!values.has(key)) values.set(key, entity)
  }
  return pageTexts.map((text) =>
    [...values.values()].flatMap((entity) =>
      findOccurrences(text, entity.value).map(({ start, end }) => ({
        type: entity.type,
        value: entity.value,
        start,
        end,
      })),
    ),
  )
}

// Rule and NER detections of one page, sorted by position, without exact
// duplicates. A detection inside a longer one is kept: if the user unmasks
// the longer one ("invest@nimbalo.io"), the shorter ("nimbalo") stays masked.
export function mergeDetections(...lists: Detection[][]): Detection[] {
  const sorted = lists.flat().sort((a, b) => a.start - b.start || b.end - a.end)
  return sorted.filter((detection, i) => {
    const previous = sorted[i - 1]
    return !(
      previous &&
      previous.start === detection.start &&
      previous.end === detection.end &&
      valueKey(previous.value) === valueKey(detection.value)
    )
  })
}

// Terms the user asked to mask, found on every page like a NER value.
export function termDetections(pageTexts: string[], terms: string[]): Detection[][] {
  return pageTexts.map((text) =>
    terms.flatMap((term) =>
      findOccurrences(text, term).map(({ start, end }) => ({ type: 'custom' as const, value: term, start, end })),
    ),
  )
}

// Line spacing and font size tolerances for lines of one visual block.
const MAX_LINE_STEP = 1.5
const FONT_TOLERANCE = 0.1

// Re-joins an entity the model split at a line break ("Brightwater" /
// "Logistics"), when the second piece continues it (I- label), both pieces
// have the same type, and the two lines belong to one visual block: the
// next line just below, same font size, overlapping horizontally. A footer
// is never joined to the text above it: smaller font, far below.
export function joinLineBreaks(page: PageText, entities: NerEntity[]): NerEntity[] {
  const joined: NerEntity[] = []
  for (const entity of [...entities].sort((a, b) => a.start - b.start)) {
    const previous = joined.at(-1)
    if (previous && entity.startsInside && previous.type === entity.type && sameBlock(page, previous, entity)) {
      joined[joined.length - 1] = {
        ...previous,
        value: page.text.slice(previous.start, entity.end).replace(/\s+/g, ' '),
        end: entity.end,
        score: Math.max(previous.score, entity.score),
      }
    } else {
      joined.push(entity)
    }
  }
  return joined
}

function sameBlock(page: PageText, first: NerEntity, second: NerEntity): boolean {
  const gap = page.text.slice(first.end, second.start)
  if (!/^[^\S\n]*\n[^\S\n]*$/.test(gap)) return false
  const above = blockAt(page, first.end - 1)
  const below = blockAt(page, second.start)
  if (!above || !below || above === below) return false
  if (Math.abs(above.fontHeight - below.fontHeight) > FONT_TOLERANCE * above.fontHeight) return false
  // Distance between baselines, across the text direction.
  const step =
    (above.originX - below.originX) * above.upX + (above.originY - below.originY) * above.upY
  if (step <= 0 || step > MAX_LINE_STEP * above.fontHeight) return false
  const a = blockRect(page, above)
  const b = blockRect(page, below)
  return a.x < b.x + b.width && b.x < a.x + a.width
}
