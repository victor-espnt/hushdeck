import type { PDFDocumentProxy } from 'pdfjs-dist'
import { extractPageText, maskRects, type PageText, type Rect } from '../pdf/textIndex.ts'
import { detectRules, type RuleMatch } from './rules.ts'

export type PageAnalysis = {
  pageText: PageText
  detections: RuleMatch[]
  // Fail closed: every detection is masked.
  masks: Rect[]
}

export function analyzePage(pageText: PageText): PageAnalysis {
  const detections = detectRules(pageText.text)
  const masks = detections.flatMap((match) => maskRects(pageText, match.start, match.end))
  return { pageText, detections, masks }
}

// One analysis per page, in page order.
export async function analyzeDocument(doc: PDFDocumentProxy): Promise<PageAnalysis[]> {
  const analyses: PageAnalysis[] = []
  for (let pageNumber = 1; pageNumber <= doc.numPages; pageNumber++) {
    const page = await doc.getPage(pageNumber)
    analyses.push(analyzePage(await extractPageText(page)))
  }
  return analyses
}
