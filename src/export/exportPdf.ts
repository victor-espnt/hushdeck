import { PDFDocument } from 'pdf-lib'
import type { PageAnalysis } from '../detect/analyzePage.ts'
import type { PDFDocumentProxy } from '../pdf/loadPdf.ts'
import { renderPage } from '../render/renderPage.ts'

export const EXPORT_SCALE = 2
export const JPEG_QUALITY = 0.85
// Never derived from the original file name.
export const EXPORT_FILE_NAME = 'anonymized-deck.pdf'
// Replaces pdf-lib's defaults; says nothing about the source document.
export const NEUTRAL_PRODUCER = 'Hushdeck'

export type RasterPage = {
  jpeg: Uint8Array
  // Page size in PDF points, as in the original document.
  width: number
  height: number
}

// A new PDF with one full-page image per page: no text layer, no
// annotations, no metadata from the source.
export async function assemblePdf(pages: RasterPage[]): Promise<Uint8Array> {
  // updateMetadata: false keeps pdf-lib from writing its own Producer,
  // Creator and dates.
  const pdf = await PDFDocument.create({ updateMetadata: false })
  pdf.setProducer(NEUTRAL_PRODUCER)
  pdf.setCreator(NEUTRAL_PRODUCER)
  for (const { jpeg, width, height } of pages) {
    const image = await pdf.embedJpg(jpeg)
    pdf.addPage([width, height]).drawImage(image, { x: 0, y: 0, width, height })
  }
  return pdf.save()
}

// Renders every page through the same function as the preview, masks
// included, and rebuilds the document from the images.
export async function exportPdf(
  doc: PDFDocumentProxy,
  analyses: PageAnalysis[],
  onProgress: (pageNumber: number) => void,
): Promise<Uint8Array> {
  const pages: RasterPage[] = []
  const canvas = document.createElement('canvas')
  try {
    for (const [i, analysis] of analyses.entries()) {
      onProgress(i + 1)
      const page = await doc.getPage(i + 1)
      await renderPage(page, canvas, analysis.masks, EXPORT_SCALE).promise
      pages.push({
        jpeg: await canvasToJpeg(canvas),
        width: analysis.pageText.width,
        height: analysis.pageText.height,
      })
      page.cleanup()
    }
  } finally {
    // Release the pixel buffer.
    canvas.width = 0
    canvas.height = 0
  }
  return assemblePdf(pages)
}

async function canvasToJpeg(canvas: HTMLCanvasElement): Promise<Uint8Array> {
  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, 'image/jpeg', JPEG_QUALITY),
  )
  if (!blob) throw new Error('JPEG encoding failed')
  return new Uint8Array(await blob.arrayBuffer())
}

export function downloadPdf(bytes: Uint8Array) {
  const blob = new Blob([bytes as Uint8Array<ArrayBuffer>], { type: 'application/pdf' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = EXPORT_FILE_NAME
  link.click()
  // Some browsers read the URL after click() returns.
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}
