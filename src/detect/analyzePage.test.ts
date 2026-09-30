import { describe, expect, it } from 'vitest'
import { buildPageText, type RawTextItem } from '../pdf/textIndex.ts'
import { analyzePage } from './analyzePage.ts'

const HEIGHT = 405
const viewport = { width: 720, height: HEIGHT, transform: [1, 0, 0, -1, 0, HEIGHT] }

function item(str: string, y: number, hasEOL = false): RawTextItem {
  return { str, transform: [12, 0, 0, 12, 40, y], width: str.length * 6, height: 12, hasEOL }
}

describe('analyzePage', () => {
  it('masks every detection', () => {
    const page = buildPageText(
      [item('Write to invest@nimbalo.io or call +44', 300, true), item('20 7946 0958 about the $2M round.', 280)],
      viewport,
    )
    const { detections, zones } = analyzePage(page)
    expect(detections.map((d) => d.type)).toEqual(['email', 'phone', 'amount'])
    // The phone number spans two lines: two masks.
    expect(zones).toHaveLength(4)
  })

  it('masks nothing on a page without detections', () => {
    const page = buildPageText([item('One request in, one priced quote out', 300)], viewport)
    expect(analyzePage(page).zones).toEqual([])
  })
})
