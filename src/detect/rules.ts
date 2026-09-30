export type DetectionType = 'email' | 'phone' | 'amount' | 'percent'

// A match in a page string: [start, end) offsets and the matched value.
export type RuleMatch = {
  type: DetectionType
  value: string
  start: number
  end: number
}

const EMAIL = /[\p{L}\d._%+-]+@[\p{L}\d-]+(?:\.[\p{L}\d-]+)*\.\p{L}{2,}/gu

// 500, 1.5, 3,2, 1,000, 1 000 000 (regular, no-break or narrow no-break spaces).
const NUMBER = String.raw`\d{1,3}(?:[,.   ]\d{3})+(?:[.,]\d+)?|\d+(?:[.,]\d+)?`
// Longest alternatives first, so "Md" wins over "M".
const UNIT = String.raw`(?:milliards?|millions?|billions?|thousands?|Mds?|bn|mn|[kKmMB])`
const CURRENCY = String.raw`(?:[€$£¥]|EUR|USD|GBP|CHF)`
const SPACE = String.raw`[   ]?`
// A number must not continue a longer word or number.
const BEFORE = String.raw`(?<![\p{L}\d.,])`
const AFTER = String.raw`(?![\p{L}\d])`

const AMOUNT = new RegExp(
  [
    // €1.5M, $14.2B, USD 2 million
    `${BEFORE}${CURRENCY}${SPACE}(?:${NUMBER})(?:${SPACE}${UNIT})?${AFTER}`,
    // 3,2 Md€, 500k€, 1 000 €, 2 M EUR
    `${BEFORE}(?:${NUMBER})(?:${SPACE}${UNIT})?${SPACE}${CURRENCY}${AFTER}`,
  ].join('|'),
  'gu',
)

// 12%, 41 %, +3.5 %
const PERCENT = new RegExp(`${BEFORE}[+\\-−]?(?:${NUMBER})${SPACE}%`, 'gu')

// Page strings break lines with '\n'. Detection reads them as spaces, so a
// value split across two lines is still found. Offsets are unchanged.
export function flattenLines(text: string): string {
  return text.replace(/\n/g, ' ')
}

function matchAll(text: string, pattern: RegExp, type: DetectionType): RuleMatch[] {
  const flat = flattenLines(text)
  return Array.from(flat.matchAll(pattern), (m) => ({
    type,
    value: m[0],
    start: m.index,
    end: m.index + m[0].length,
  }))
}

export function detectEmails(text: string): RuleMatch[] {
  return matchAll(text, EMAIL, 'email')
}

export function detectAmounts(text: string): RuleMatch[] {
  return matchAll(text, AMOUNT, 'amount')
}

export function detectPercents(text: string): RuleMatch[] {
  return matchAll(text, PERCENT, 'percent')
}

// Every rule match in a page string, sorted by position.
export function detectRules(text: string): RuleMatch[] {
  return [...detectEmails(text), ...detectAmounts(text), ...detectPercents(text)].sort(
    (a, b) => a.start - b.start || b.end - a.end,
  )
}
