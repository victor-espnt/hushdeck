import { describe, expect, it } from 'vitest'
import { MIN_AREA_SIZE, rectFromCorners } from './manualArea.ts'

describe('rectFromCorners', () => {
  it('accepts corners in any order', () => {
    const rect = { x: 10, y: 20, width: 90, height: 30 }
    expect(rectFromCorners(10, 20, 100, 50, 720, 405)).toEqual(rect)
    expect(rectFromCorners(100, 50, 10, 20, 720, 405)).toEqual(rect)
  })

  it('keeps the area inside the page', () => {
    expect(rectFromCorners(-20, -5, 800, 500, 720, 405)).toEqual({ x: 0, y: 0, width: 720, height: 405 })
  })

  it('takes a tiny drag for a click', () => {
    expect(rectFromCorners(10, 10, 10 + MIN_AREA_SIZE - 1, 50, 720, 405)).toBeNull()
    expect(rectFromCorners(10, 10, 50, 11, 720, 405)).toBeNull()
  })
})
