import { describe, expect, it } from 'vitest'
import { buildPageText, type RawTextItem } from '../pdf/textIndex.ts'
import { analyzePage, maskedRects } from './analyzePage.ts'
import type { Detection } from './merge.ts'
import { reviewGroups } from './review.ts'

const HEIGHT = 405
const viewport = { width: 720, height: HEIGHT, transform: [1, 0, 0, -1, 0, HEIGHT] }
const item = (str: string, y: number): RawTextItem => ({
  str,
  transform: [12, 0, 0, 12, 40, y],
  width: str.length * 6,
  height: 12,
  hasEOL: true,
})

const page1 = buildPageText([item('Claire Dubois raised $2M, write to claire@nimbalo.io', 300)], viewport)
const page2 = buildPageText([item('Ask Claire Dubois about the $2M round', 300)], viewport)
const person = (text: string, value: string): Detection[] => {
  const start = text.indexOf(value)
  return [{ type: 'person', value, start, end: start + value.length }]
}
const pages = [
  analyzePage(page1, person(page1.text, 'Claire Dubois')),
  analyzePage(page2, person(page2.text, 'Claire Dubois')),
]

describe('reviewGroups', () => {
  it('groups unique values by type, in panel order, with their counts', () => {
    expect(reviewGroups(pages)).toEqual([
      { type: 'person', label: 'People', values: [{ key: 'claire dubois', value: 'Claire Dubois', count: 2 }] },
      { type: 'email', label: 'Emails', values: [{ key: 'claire@nimbalo.io', value: 'claire@nimbalo.io', count: 1 }] },
      { type: 'amount', label: 'Amounts', values: [{ key: '$2m', value: '$2M', count: 2 }] },
    ])
  })
})

describe('maskedRects', () => {
  it('masks every zone by default', () => {
    expect(maskedRects(pages[0], new Set())).toHaveLength(pages[0].zones.length)
  })

  it('unmasks every occurrence of an unchecked value, on every page', () => {
    const unmasked = new Set(['claire dubois'])
    expect(maskedRects(pages[0], unmasked)).toHaveLength(2)
    expect(maskedRects(pages[1], unmasked)).toHaveLength(1)
  })
})
