import type { PDFPageProxy } from 'pdfjs-dist'

// Rectangles are in page units at scale 1, top-left origin (viewport space).
// Multiply by the render scale to get canvas pixels.
export type Rect = { x: number; y: number; width: number; height: number }

// The fields of a pdf.js TextItem that the index uses.
export type RawTextItem = {
  str: string
  transform: number[]
  width: number
  height: number
  hasEOL: boolean
}

export type PageViewportLike = {
  width: number
  height: number
  transform: number[]
}

// One text item from the PDF, placed in the page string at [start, end).
export type TextBlock = {
  str: string
  start: number
  end: number
  // PDF user space: baseline origin, unit vectors along and across the text,
  // advance width and font height.
  originX: number
  originY: number
  alongX: number
  alongY: number
  upX: number
  upY: number
  advance: number
  fontHeight: number
}

export type PageText = {
  pageNumber: number
  // Page width and height at scale 1.
  width: number
  height: number
  // Every block's string joined, with '\n' between lines.
  text: string
  // Sorted by start offset, without overlap.
  blocks: TextBlock[]
  viewportTransform: number[]
}

// Glyph box relative to the font size: descenders below the baseline,
// ascenders above it.
const DESCENT = 0.25
const ASCENT = 0.9

export async function extractPageText(page: PDFPageProxy): Promise<PageText> {
  const viewport = page.getViewport({ scale: 1 })
  const content = await page.getTextContent()
  const items = content.items.filter((item) => 'str' in item)
  return buildPageText(items, viewport, page.pageNumber)
}

export function buildPageText(
  items: RawTextItem[],
  viewport: PageViewportLike,
  pageNumber = 1,
): PageText {
  let text = ''
  const blocks: TextBlock[] = []
  let previous: TextBlock | undefined
  let breakPending = false

  for (const item of items) {
    if (item.str === '') {
      if (item.hasEOL) breakPending = true
      continue
    }
    const block = toBlock(item)
    if (previous && (breakPending || !onSameLine(previous, block))) {
      if (!text.endsWith('\n')) text += '\n'
    }
    block.start = text.length
    block.end = block.start + item.str.length
    text += item.str
    blocks.push(block)
    previous = block
    breakPending = item.hasEOL
  }

  return {
    pageNumber,
    width: viewport.width,
    height: viewport.height,
    text,
    blocks,
    viewportTransform: viewport.transform,
  }
}

// start and end are set once the block is placed in the page string.
function toBlock(item: RawTextItem): TextBlock {
  const [a, b, c, d, e, f] = item.transform
  const scaleX = Math.hypot(a, b) || 1
  const scaleY = Math.hypot(c, d) || 1
  return {
    str: item.str,
    start: 0,
    end: 0,
    originX: e,
    originY: f,
    alongX: a / scaleX,
    alongY: b / scaleX,
    upX: c / scaleY,
    upY: d / scaleY,
    advance: item.width,
    fontHeight: item.height || scaleY,
  }
}

// Same baseline, measured across the text direction.
function onSameLine(a: TextBlock, b: TextBlock): boolean {
  const offset = (b.originX - a.originX) * a.upX + (b.originY - a.originY) * a.upY
  return Math.abs(offset) < Math.min(a.fontHeight, b.fontHeight) / 2
}

// The block containing the character at `offset`, or undefined for a line break.
export function blockAt(page: PageText, offset: number): TextBlock | undefined {
  let low = 0
  let high = page.blocks.length - 1
  while (low <= high) {
    const mid = (low + high) >> 1
    const block = page.blocks[mid]
    if (offset < block.start) high = mid - 1
    else if (offset >= block.end) low = mid + 1
    else return block
  }
  return undefined
}

// Characters [from, to) of a block. A partial range gets a horizontal extent
// proportional to its character offsets.
export function blockRect(
  page: PageText,
  block: TextBlock,
  from = 0,
  to = block.str.length,
): Rect {
  const length = block.str.length
  const t0 = (block.advance * from) / length
  const t1 = (block.advance * to) / length
  const s0 = -DESCENT * block.fontHeight
  const s1 = ASCENT * block.fontHeight

  const xs: number[] = []
  const ys: number[] = []
  for (const t of [t0, t1]) {
    for (const s of [s0, s1]) {
      const x = block.originX + t * block.alongX + s * block.upX
      const y = block.originY + t * block.alongY + s * block.upY
      const [vx, vy] = applyTransform(page.viewportTransform, x, y)
      xs.push(vx)
      ys.push(vy)
    }
  }
  const left = Math.min(...xs)
  const top = Math.min(...ys)
  return {
    x: left,
    y: top,
    width: Math.max(...xs) - left,
    height: Math.max(...ys) - top,
  }
}

// One rectangle per block touched by the page string range [start, end).
export function rangeToRects(page: PageText, start: number, end: number): Rect[] {
  const rects: Rect[] = []
  if (end <= start) return rects
  for (const block of page.blocks) {
    if (block.end <= start) continue
    if (block.start >= end) break
    const from = Math.max(start, block.start) - block.start
    const to = Math.min(end, block.end) - block.start
    rects.push(blockRect(page, block, from, to))
  }
  return rects
}

function applyTransform(m: number[], x: number, y: number): [number, number] {
  return [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]]
}
