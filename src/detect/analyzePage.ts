import type { PDFDocumentProxy } from 'pdfjs-dist'
import { extractPageText, maskRects, type PageText, type Rect } from '../pdf/textIndex.ts'
import { mergeDetections, valueKey, type Detection, type DetectionType } from './merge.ts'
import { detectRules } from './rules.ts'

// One area to mask, tied to the value it hides.
export type Zone = {
  key: string
  value: string
  type: DetectionType
  rect: Rect
}

export type PageAnalysis = {
  pageText: PageText
  detections: Detection[]
  zones: Zone[]
}

// Rule detections, plus any found elsewhere (the NER model, the user's own
// terms) for this page.
export function analyzePage(pageText: PageText, extra: Detection[] = []): PageAnalysis {
  const detections = mergeDetections(detectRules(pageText.text), extra)
  const zones = detections.flatMap((detection) =>
    maskRects(pageText, detection.start, detection.end).map((rect) => ({
      key: valueKey(detection.value),
      value: detection.value,
      type: detection.type,
      rect,
    })),
  )
  return { pageText, detections, zones }
}

// Fail closed: a zone is masked unless the user unmasked its value.
export function maskedRects(page: PageAnalysis, unmasked: ReadonlySet<string>): Rect[] {
  return page.zones.filter((zone) => !unmasked.has(zone.key)).map((zone) => zone.rect)
}

// The text index of every page, in page order.
export async function extractDocumentText(doc: PDFDocumentProxy): Promise<PageText[]> {
  const pages: PageText[] = []
  for (let pageNumber = 1; pageNumber <= doc.numPages; pageNumber++) {
    pages.push(await extractPageText(await doc.getPage(pageNumber)))
  }
  return pages
}
