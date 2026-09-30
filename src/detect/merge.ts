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
