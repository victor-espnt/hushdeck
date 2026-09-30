import { RENDER_SCALE, renderPageToCanvas, type PDFPageProxy } from '../pdf/loadPdf.ts'
import type { Rect } from '../pdf/textIndex.ts'

export type RenderJob = {
  promise: Promise<void>
  cancel: () => void
}

// The single render function: the preview and the export both draw pages
// through it, so what the user sees is exactly what gets burned.
// Masks are in page units and are drawn as opaque black boxes.
export function renderPage(
  page: PDFPageProxy,
  canvas: HTMLCanvasElement,
  masks: Rect[],
  scale = RENDER_SCALE,
): RenderJob {
  const task = renderPageToCanvas(page, canvas, scale)
  const promise = task.promise.then(() => {
    const context = canvas.getContext('2d')
    if (!context) throw new Error('Canvas 2D context unavailable')
    context.fillStyle = '#000'
    for (const mask of masks) {
      // Snap outwards to whole pixels: no half-covered edge pixel.
      const left = Math.floor(mask.x * scale)
      const top = Math.floor(mask.y * scale)
      const right = Math.ceil((mask.x + mask.width) * scale)
      const bottom = Math.ceil((mask.y + mask.height) * scale)
      context.fillRect(left, top, right - left, bottom - top)
    }
  })
  return { promise, cancel: () => task.cancel() }
}
