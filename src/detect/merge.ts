import type { NerEntity, NerType } from './ner.ts'
import type { RuleType } from './rules.ts'

export type DetectionType = RuleType | NerType

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

// A NER entity is a value: it is masked wherever it occurs in the deck,
// including pages where the model missed it.
export function nerDetections(pageTexts: string[], entitiesPerPage: NerEntity[][]): Detection[][] {
  const values = new Map<string, NerEntity>()
  for (const entity of entitiesPerPage.flat()) {
    const key = entity.value.toLowerCase()
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

// Rule and NER detections of one page, sorted by position. Exact duplicates
// and detections inside a longer one (a name inside an email) are dropped;
// partial overlaps are kept, so their masks cover both.
export function mergeDetections(...lists: Detection[][]): Detection[] {
  const sorted = lists.flat().sort((a, b) => a.start - b.start || b.end - a.end)
  const merged: Detection[] = []
  let reach = -1
  for (const detection of sorted) {
    if (detection.end <= reach) continue
    merged.push(detection)
    reach = detection.end
  }
  return merged
}
