import { describe, expect, it } from 'vitest'
import {
  blockAt,
  blockRect,
  buildPageText,
  MASK_PADDING_ACROSS,
  MASK_PADDING_EM,
  maskRects,
  rangeToRects,
  type RawTextItem,
} from './textIndex.ts'

// Page 1 of public/sample-deck.pdf, as pdf.js returns it.
const HEIGHT = 405
const viewport = { width: 720, height: HEIGHT, transform: [1, 0, 0, -1, 0, HEIGHT] }

function item(str: string, size: number, x: number, y: number, width: number, hasEOL = false): RawTextItem {
  return { str, transform: [size, 0, 0, size, x, y], width, height: str ? size : 0, hasEOL }
}

const contact = 'Claire Dubois, CEO · claire.dubois@nimbalo.io · +33 6 39 98 12 34'
const items = [
  item('Quote freight in 30 seconds,', 40, 43, 260, 536, true),
  item('not 3 hours.', 40, 43, 212, 228),
  item('', 18, 43, 156, 0, true),
  item('Seed round · $2M · October 2026', 18, 43, 156, 242),
  item('', 13, 43, 81, 0, true),
  item(contact, 13, 43, 81, 354),
]

describe('buildPageText', () => {
  it('joins blocks with a line break at each end of line', () => {
    const page = buildPageText(items, viewport)
    expect(page.text).toBe(
      ['Quote freight in 30 seconds,', 'not 3 hours.', 'Seed round · $2M · October 2026', contact].join('\n'),
    )
    expect(page.blocks).toHaveLength(4)
    expect(page.width).toBe(720)
    expect(page.height).toBe(HEIGHT)
  })

  it('maps each block to its offsets in the page string', () => {
    const page = buildPageText(items, viewport)
    for (const block of page.blocks) {
      expect(page.text.slice(block.start, block.end)).toBe(block.str)
    }
  })

  it('breaks the line when the baseline changes without an end-of-line flag', () => {
    const page = buildPageText([item('Title', 20, 40, 300, 50), item('Body', 12, 40, 200, 30)], viewport)
    expect(page.text).toBe('Title\nBody')
  })

  it('keeps pieces of the same line together', () => {
    const page = buildPageText([item('Nim', 12, 40, 100, 20), item('balo', 12, 60, 100, 25)], viewport)
    expect(page.text).toBe('Nimbalo')
  })
})

describe('blockAt', () => {
  const page = buildPageText(items, viewport)

  it('finds the block holding an offset', () => {
    const offset = page.text.indexOf('claire.dubois')
    expect(blockAt(page, offset)?.str).toBe(contact)
    expect(blockAt(page, 0)?.str).toBe('Quote freight in 30 seconds,')
  })

  it('returns nothing for a line break or past the end', () => {
    expect(blockAt(page, page.text.indexOf('\n'))).toBeUndefined()
    expect(blockAt(page, page.text.length)).toBeUndefined()
  })
})

describe('blockRect', () => {
  const page = buildPageText(items, viewport)

  it('converts a whole block to a top-left rectangle', () => {
    const rect = blockRect(page, page.blocks[1])
    expect(rect.x).toBeCloseTo(43)
    expect(rect.width).toBeCloseTo(228)
    // Baseline at y = 212 from the bottom; ascent 0.9 and descent 0.25 of 40.
    expect(rect.y).toBeCloseTo(HEIGHT - 212 - 36)
    expect(rect.height).toBeCloseTo(46)
  })

  it('handles text rotated by 90 degrees', () => {
    const rotated = buildPageText(
      [{ str: 'Side', transform: [0, 10, -10, 0, 100, 100], width: 40, height: 10, hasEOL: false }],
      viewport,
    )
    const rect = blockRect(rotated, rotated.blocks[0])
    expect(rect.width).toBeCloseTo(11.5)
    expect(rect.height).toBeCloseTo(40)
  })
})

describe('rangeToRects', () => {
  const page = buildPageText(items, viewport)

  it('estimates a partial range in proportion to typical character widths', () => {
    // Helvetica: "i" is 222/1000 em wide, "M" 833/1000.
    const narrowWide = buildPageText([item('iiiiMMMM', 10, 100, 200, 422)], viewport)
    const [narrow] = rangeToRects(narrowWide, 0, 4)
    const [wide] = rangeToRects(narrowWide, 4, 8)
    expect(narrow.x).toBeCloseTo(100)
    expect(narrow.width).toBeCloseTo((422 * 222) / (222 + 833))
    expect(wide.x).toBeCloseTo(narrow.x + narrow.width)
    expect(wide.width).toBeCloseTo((422 * 833) / (222 + 833))
  })

  it('places a mid-block range inside its block', () => {
    const email = 'claire.dubois@nimbalo.io'
    const start = page.text.indexOf(email)
    const [rect] = rangeToRects(page, start, start + email.length)
    expect(rect.x).toBeGreaterThan(43)
    expect(rect.x + rect.width).toBeLessThan(43 + 354)
  })

  it('returns one rectangle per block a range spans', () => {
    const start = page.text.indexOf('seconds')
    const end = page.text.indexOf('hours') + 'hours'.length
    const rects = rangeToRects(page, start, end)
    expect(rects).toHaveLength(2)
    expect(rects[0].y).toBeLessThan(rects[1].y)
  })

  it('returns nothing for an empty range', () => {
    expect(rangeToRects(page, 5, 5)).toEqual([])
  })
})

describe('maskRects', () => {
  const page = buildPageText(items, viewport)

  it('pads 0.3 em of the block font along the text, 2 units across', () => {
    const email = 'claire.dubois@nimbalo.io'
    const start = page.text.indexOf(email)
    const [estimate] = rangeToRects(page, start, start + email.length)
    const [mask] = maskRects(page, start, start + email.length)
    // The contact line is set in 13 pt.
    const along = MASK_PADDING_EM * 13
    expect(mask.x).toBeCloseTo(estimate.x - along)
    expect(mask.width).toBeCloseTo(estimate.width + 2 * along)
    expect(mask.y).toBeCloseTo(estimate.y - MASK_PADDING_ACROSS)
    expect(mask.height).toBeCloseTo(estimate.height + 2 * MASK_PADDING_ACROSS)
  })

  it('scales the horizontal margin with the font size', () => {
    const title = page.text.indexOf('seconds')
    const contact = page.text.indexOf('CEO')
    const [large] = maskRects(page, title, title + 3)
    const [small] = maskRects(page, contact, contact + 3)
    const [largeEstimate] = rangeToRects(page, title, title + 3)
    const [smallEstimate] = rangeToRects(page, contact, contact + 3)
    expect(large.width - largeEstimate.width).toBeCloseTo(2 * MASK_PADDING_EM * 40)
    expect(small.width - smallEstimate.width).toBeCloseTo(2 * MASK_PADDING_EM * 13)
  })

  it('pads each line of a range that spans two blocks', () => {
    const start = page.text.indexOf('seconds')
    const end = page.text.indexOf('hours') + 'hours'.length
    expect(maskRects(page, start, end)).toHaveLength(2)
  })

  it('keeps the padded area inside the page', () => {
    const corner = buildPageText([item('Top', 10, 0, HEIGHT - 9, 20)], viewport)
    const [mask] = maskRects(corner, 0, 3)
    expect(mask.x).toBe(0)
    expect(mask.y).toBe(0)
    expect(mask.width).toBeCloseTo(20 + MASK_PADDING_EM * 10)
  })
})
