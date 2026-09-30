import type { PDFDocumentProxy } from 'pdfjs-dist'
import { extractPageText, maskRects, type PageText, type Rect } from '../pdf/textIndex.ts'
import { mergeDetections, type Detection } from './merge.ts'
import { detectRules } from './rules.ts'

export type PageAnalysis = {
  pageText: PageText
  detections: Detection[]
  // Fail closed: every detection is masked.
  masks: Rect[]
}

// Rule detections, plus any found elsewhere (the NER model) for this page.
export function analyzePage(pageText: PageText, extra: Detection[] = []): PageAnalysis {
  const detections = mergeDetections(detectRules(pageText.text), extra)
  const masks = detections.flatMap((match) => maskRects(pageText, match.start, match.end))
  return { pageText, detections, masks }
}

// The text index of every page, in page order.
export async function extractDocumentText(doc: PDFDocumentProxy): Promise<PageText[]> {
  const pages: PageText[] = []
  for (let pageNumber = 1; pageNumber <= doc.numPages; pageNumber++) {
    pages.push(await extractPageText(await doc.getPage(pageNumber)))
  }
  return pages
}
