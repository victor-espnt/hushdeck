import { describe, expect, it } from 'vitest'
import { SAMPLE_DECK_PAGES } from './fixtures/sampleDeck.ts'
import {
  detectAmounts,
  detectEmails,
  detectPercents,
  detectPhones,
  detectRules,
  type RuleMatch,
} from './rules.ts'

const page = (n: number) => SAMPLE_DECK_PAGES[n - 1]
const values = (matches: RuleMatch[]) => matches.map((m) => m.value)

describe('detectEmails', () => {
  it('finds an email in the middle of a sentence', () => {
    expect(values(detectEmails(page(9)))).toEqual(['invest@nimbalo.io'])
  })

  it('finds an email between separators', () => {
    expect(values(detectEmails(page(1)))).toEqual(['claire.dubois@nimbalo.io'])
  })

  it('finds every email on the team page', () => {
    expect(values(detectEmails(page(7)))).toEqual([
      'claire.dubois@nimbalo.io',
      'marcus@nimbalo.io',
      'priya.raman@nimbalo.io',
    ])
  })

  it('leaves out trailing punctuation', () => {
    expect(values(detectEmails('Write to jane.doe@example.co.uk.'))).toEqual(['jane.doe@example.co.uk'])
  })

  it('returns offsets into the page string', () => {
    const [match] = detectEmails(page(9))
    expect(page(9).slice(match.start, match.end)).toBe('invest@nimbalo.io')
  })
})

describe('detectAmounts', () => {
  it('finds French notation: 3,2 Md€', () => {
    expect(values(detectAmounts(page(6)))).toEqual(['$14.2B', '$14.2B', '3,2 Md€', '€410M'])
  })

  it('finds a suffixed amount: 500k€', () => {
    expect(values(detectAmounts(page(8)))).toEqual(['$2M', '500k€', '$12M'])
  })

  it('finds prefixed amounts', () => {
    expect(values(detectAmounts(page(1)))).toEqual(['$2M'])
    expect(values(detectAmounts(page(4)))).toEqual(['€1.5M', '€1.5M'])
  })

  it('ignores bare numbers, years, durations and a unit label', () => {
    // Page 4 holds a chart axis and "ARR, k€"; the others "3 h", "2026", "75011 Paris".
    for (const n of [2, 3, 5, 7, 9]) {
      expect(detectAmounts(page(n))).toEqual([])
    }
    expect(values(detectAmounts(page(4)))).not.toContain('1,500')
  })

  it('reads other common formats', () => {
    expect(values(detectAmounts('from 1 000 € to USD 2 million, or £3.5bn'))).toEqual([
      '1 000 €',
      'USD 2 million',
      '£3.5bn',
    ])
  })

  it('does not start inside a word or a number', () => {
    expect(detectAmounts('ref A12€ and 1.2.3€')).toEqual([])
  })
})

describe('detectPercents', () => {
  it('finds percentages with and without a space: 41 %, 12%', () => {
    expect(values(detectPercents(page(2)))).toEqual(['12%', '41 %'])
  })

  it('finds every percentage on the traction and funds pages', () => {
    expect(values(detectPercents(page(4)))).toEqual(['22%', '120 %'])
    expect(values(detectPercents(page(8)))).toEqual(['60%', '25%', '15%'])
  })

  it('keeps a sign and decimals', () => {
    expect(values(detectPercents('up +3.5 % and 2,75% down'))).toEqual(['+3.5 %', '2,75%'])
  })
})

describe('detectPhones', () => {
  it('finds a French mobile in international format', () => {
    expect(values(detectPhones(page(1)))).toEqual(['+33 6 39 98 12 34'])
  })

  it('finds a number split across two lines', () => {
    const matches = detectPhones(page(9))
    expect(values(matches)).toEqual(['+1 415 555 0142', '+44 20 7946 0958'])
    // Offsets span the line break in the page string.
    const split = matches[1]
    expect(page(9).slice(split.start, split.end)).toBe('+44\n20 7946 0958')
  })

  it('reads French national formats', () => {
    expect(values(detectPhones('Appelez le 06 39 98 12 34 ou le 01.42.68.53.00.'))).toEqual([
      '06 39 98 12 34',
      '01.42.68.53.00',
    ])
  })

  it('reads other international formats', () => {
    expect(values(detectPhones('Call 0033 1 42 68 53 00, +49 30 901820 or +32 2 555 12 12.'))).toEqual([
      '0033 1 42 68 53 00',
      '+49 30 901820',
      '+32 2 555 12 12',
    ])
  })

  it('ignores chart axes, dates, postcodes and page numbers', () => {
    for (const n of [2, 3, 4, 5, 6, 7, 8]) {
      expect(detectPhones(page(n))).toEqual([])
    }
  })
})

describe('detectRules', () => {
  it('reads a value split across two lines', () => {
    const [match] = detectRules('raised €2\nmillion')
    expect(match).toMatchObject({ type: 'amount', value: '€2 million', start: 7, end: 17 })
  })

  it('returns every type sorted by position', () => {
    const matches = detectRules(page(1))
    expect(matches.map((m) => m.type)).toEqual(['amount', 'email', 'phone'])
    expect(matches[0].start).toBeLessThan(matches[1].start)
    expect(matches[1].start).toBeLessThan(matches[2].start)
  })
})
