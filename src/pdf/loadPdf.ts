import {
  getDocument,
  GlobalWorkerOptions,
  PasswordException,
  RenderingCancelledException,
  VerbosityLevel,
  type PDFDocumentProxy,
  type PDFPageProxy,
  type RenderTask,
} from 'pdfjs-dist'
// Vite pitfall: pdf.js needs the URL of its worker file, not the module itself.
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'

GlobalWorkerOptions.workerSrc = workerUrl

export type { PDFDocumentProxy, PDFPageProxy }

// Same scale as the export, so the preview shows what will be burned.
export const RENDER_SCALE = 2

export async function loadPdf(file: File): Promise<PDFDocumentProxy> {
  const data = new Uint8Array(await file.arrayBuffer())
  return getDocument({ data, verbosity: VerbosityLevel.ERRORS }).promise
}

export function loadErrorMessage(err: unknown): string {
  if (err instanceof PasswordException) {
    return 'This PDF is password-protected. Remove the password and try again.'
  }
  return 'This file could not be read as a PDF.'
}

export function renderPageToCanvas(
  page: PDFPageProxy,
  canvas: HTMLCanvasElement,
  scale = RENDER_SCALE,
): RenderTask {
  const viewport = page.getViewport({ scale })
  canvas.width = Math.floor(viewport.width)
  canvas.height = Math.floor(viewport.height)
  return page.render({ canvas, viewport })
}

export function isRenderCancelled(err: unknown): boolean {
  return err instanceof RenderingCancelledException
}
