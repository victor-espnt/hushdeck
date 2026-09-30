import { useEffect, useRef, useState } from 'react'
import type { PageAnalysis } from '../detect/analyzePage.ts'
import { isRenderCancelled, type PDFDocumentProxy } from '../pdf/loadPdf.ts'
import { blockRect, rangeToRects } from '../pdf/textIndex.ts'
import { renderPage } from '../render/renderPage.ts'

type Props = {
  doc: PDFDocumentProxy
  pageNumber: number
  analysis: PageAnalysis
  showOverlay: boolean
}

export default function PageView({ doc, pageNumber, analysis, showOverlay }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let cancelled = false
    let cancelRender: (() => void) | undefined

    doc
      .getPage(pageNumber)
      .then((page) => {
        if (cancelled || !canvasRef.current) return
        const job = renderPage(page, canvasRef.current, analysis.masks)
        cancelRender = job.cancel
        return job.promise
      })
      .catch((err: unknown) => {
        if (!cancelled && !isRenderCancelled(err)) setFailed(true)
      })

    return () => {
      cancelled = true
      cancelRender?.()
    }
  }, [doc, pageNumber, analysis])

  return (
    <figure className="page">
      <div className="page__sheet">
        <canvas ref={canvasRef} aria-label={`Page ${pageNumber}`} />
        {showOverlay && <DebugOverlay analysis={analysis} />}
      </div>
      <figcaption>
        {failed ? `Page ${pageNumber} could not be rendered.` : `Page ${pageNumber}`}
      </figcaption>
    </figure>
  )
}

// Debug aid, drawn above the canvas: never part of the render or the export.
function DebugOverlay({ analysis }: { analysis: PageAnalysis }) {
  const { pageText, detections } = analysis
  return (
    <svg
      className="page__overlay"
      viewBox={`0 0 ${pageText.width} ${pageText.height}`}
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      {pageText.blocks
        .filter((block) => block.str.trim() !== '')
        .map((block) => {
          const rect = blockRect(pageText, block)
          return (
            <rect
              key={block.start}
              className="overlay-block"
              x={rect.x}
              y={rect.y}
              width={rect.width}
              height={rect.height}
            />
          )
        })}
      {detections.flatMap((match) =>
        rangeToRects(pageText, match.start, match.end).map((rect, i) => (
          <rect
            key={`${match.type}-${match.start}-${i}`}
            className={`overlay-${match.type}`}
            x={rect.x}
            y={rect.y}
            width={rect.width}
            height={rect.height}
          />
        )),
      )}
    </svg>
  )
}
