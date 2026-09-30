import type { Rect } from '../pdf/textIndex.ts'

// An area the user drew by hand on a page, in page units.
export type ManualArea = {
  id: number
  // 0-based page index.
  page: number
  rect: Rect
}

// Below this size in page units, a drag is taken for a click.
export const MIN_AREA_SIZE = 3

// The rectangle between two corners, kept inside the page, or null when
// it is too small to be meant as an area.
export function rectFromCorners(
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  pageWidth: number,
  pageHeight: number,
): Rect | null {
  const clampX = (x: number) => Math.min(pageWidth, Math.max(0, x))
  const clampY = (y: number) => Math.min(pageHeight, Math.max(0, y))
  const left = clampX(Math.min(x0, x1))
  const right = clampX(Math.max(x0, x1))
  const top = clampY(Math.min(y0, y1))
  const bottom = clampY(Math.max(y0, y1))
  if (right - left < MIN_AREA_SIZE || bottom - top < MIN_AREA_SIZE) return null
  return { x: left, y: top, width: right - left, height: bottom - top }
}
