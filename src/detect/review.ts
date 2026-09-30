import type { PageAnalysis } from './analyzePage.ts'
import { valueKey, type DetectionType } from './merge.ts'

export const REVIEW_GROUPS: { type: DetectionType; label: string }[] = [
  { type: 'person', label: 'People' },
  { type: 'organization', label: 'Organizations' },
  { type: 'email', label: 'Emails' },
  { type: 'phone', label: 'Phones' },
  { type: 'amount', label: 'Amounts' },
  { type: 'percent', label: 'Percentages' },
  { type: 'custom', label: 'Custom' },
]

// Values that can be a fragment of a longer one: a first name alone, a
// word of an organization's name.
const ENTITY_TYPES: ReadonlySet<DetectionType> = new Set(['person', 'organization'])

export type ReviewRow = {
  key: string
  // The longest form of the entity, as first found in the deck.
  value: string
  // Places in the deck where the entity, or one of its fragments, stands
  // on its own (not inside another detection).
  count: number
}

export type ReviewGroup = {
  type: DetectionType
  label: string
  rows: ReviewRow[]
}

export type Review = {
  groups: ReviewGroup[]
  // The rows a value belongs to: itself, or every longer entity it is a
  // fragment of. A value is masked unless all its rows are unchecked.
  rowsOf: (key: string) => string[]
}

type Value = { key: string; value: string; type: DetectionType; words: string[] }

// True when `part` appears as consecutive whole words inside `whole`.
function isFragment(part: string[], whole: string[]): boolean {
  if (part.length >= whole.length) return false
  for (let i = 0; i + part.length <= whole.length; i++) {
    if (part.every((word, j) => whole[i + j] === word)) return true
  }
  return false
}

export function buildReview(pages: PageAnalysis[]): Review {
  const values = new Map<string, Value>()
  for (const detection of pages.flatMap((page) => page.detections)) {
    const key = valueKey(detection.value)
    if (!values.has(key)) {
      const value = detection.value.replace(/\s+/g, ' ')
      values.set(key, { key, value, type: detection.type, words: key.split(' ') })
    }
  }

  const entities = [...values.values()].filter((value) => ENTITY_TYPES.has(value.type))
  const rows = new Map<string, string[]>()
  for (const value of values.values()) {
    const parents = ENTITY_TYPES.has(value.type)
      ? entities.filter((other) => isFragment(value.words, other.words))
      : []
    // Attach to the longest forms only: "Castellane" goes to "Castellane
    // Transports", not to a middle form.
    const longest = parents.filter((parent) => !entities.some((other) => isFragment(parent.words, other.words)))
    rows.set(value.key, longest.length > 0 ? longest.map((parent) => parent.key) : [value.key])
  }
  const rowsOf = (key: string) => rows.get(key) ?? [key]

  // Count each standalone occurrence once, in every row it belongs to.
  const counts = new Map<string, number>()
  for (const page of pages) {
    for (const detection of page.detections) {
      const inside = page.detections.some(
        (other) =>
          other !== detection &&
          other.start <= detection.start &&
          other.end >= detection.end &&
          other.end - other.start > detection.end - detection.start,
      )
      if (inside) continue
      for (const row of rowsOf(valueKey(detection.value))) counts.set(row, (counts.get(row) ?? 0) + 1)
    }
  }

  const groups = REVIEW_GROUPS.map(({ type, label }) => ({
    type,
    label,
    rows: [...values.values()]
      .filter((value) => value.type === type && rowsOf(value.key)[0] === value.key)
      .map(({ key, value }) => ({ key, value, count: counts.get(key) ?? 0 })),
  })).filter((group) => group.rows.length > 0)

  return { groups, rowsOf }
}
