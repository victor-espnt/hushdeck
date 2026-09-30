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
let workerPort: Promise<Worker> | undefined

// One pdf.js worker for the whole session, started on first use. Inline:
// it starts from a blob: URL and so inherits the page's
// Content-Security-Policy, which a worker loaded from its own URL does not.
// Imported on demand to keep it out of the initial download.
async function startWorker() {
  workerPort ??= import('pdfjs-dist/build/pdf.worker.min.mjs?worker&inline').then(
    ({ default: PdfJsWorker }) => new PdfJsWorker(),
  )
  GlobalWorkerOptions.workerPort = await workerPort
}

export type { PDFDocumentProxy, PDFPageProxy }

// Same scale as the export, so the preview shows what will be burned.
export const RENDER_SCALE = 2

export async function loadPdf(file: File): Promise<PDFDocumentProxy> {
  await startWorker()
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
