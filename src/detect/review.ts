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

export type ReviewValue = {
  key: string
  // As first found in the deck.
  value: string
  // Occurrences across the deck.
  count: number
}

export type ReviewGroup = {
  type: DetectionType
  label: string
  values: ReviewValue[]
}

// One row per unique value, in the group of the type it was first found
// with. Groups without values are left out.
export function reviewGroups(pages: PageAnalysis[]): ReviewGroup[] {
  const values = new Map<string, ReviewValue & { type: DetectionType }>()
  for (const detection of pages.flatMap((page) => page.detections)) {
    const key = valueKey(detection.value)
    const existing = values.get(key)
    if (existing) existing.count++
    else values.set(key, { key, value: detection.value.replace(/\s+/g, ' '), count: 1, type: detection.type })
  }
  return REVIEW_GROUPS.map(({ type, label }) => ({
    type,
    label,
    values: [...values.values()]
      .filter((value) => value.type === type)
      .map(({ key, value, count }) => ({ key, value, count })),
  })).filter((group) => group.values.length > 0)
}
