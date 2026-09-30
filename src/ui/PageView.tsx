import { useEffect, useRef, useState } from 'react'
import type { PageAnalysis } from '../detect/analyzePage.ts'
import type { Rect } from '../pdf/textIndex.ts'
import { isRenderCancelled, type PDFDocumentProxy } from '../pdf/loadPdf.ts'
import { blockRect, rangeToRects } from '../pdf/textIndex.ts'
import { renderPage } from '../render/renderPage.ts'

type Props = {
  doc: PDFDocumentProxy
  pageNumber: number
  analysis: PageAnalysis
  // The areas burned in black, as in the export.
  masks: Rect[]
  // Keys of the values the user unmasked: outlined in the preview only.
  unmasked: ReadonlySet<string>
  showOverlay: boolean
}

export default function PageView({ doc, pageNumber, analysis, masks, unmasked, showOverlay }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [failed, setFailed] = useState(false)

  // Redraw only when this page's masks change, not on every NER update.
  const masksKey = JSON.stringify(masks)

  useEffect(() => {
    let cancelled = false
    let cancelRender: (() => void) | undefined
    // Drawn off screen, then copied in one step: the page never shows
    // without its masks, even for a frame.
    const offscreen = document.createElement('canvas')

    doc
      .getPage(pageNumber)
      .then((page) => {
        if (cancelled) return
        const job = renderPage(page, offscreen, JSON.parse(masksKey))
        cancelRender = job.cancel
        return job.promise.then(() => {
          const canvas = canvasRef.current
          if (cancelled || !canvas) return
          canvas.width = offscreen.width
          canvas.height = offscreen.height
          canvas.getContext('2d')?.drawImage(offscreen, 0, 0)
        })
      })
      .catch((err: unknown) => {
        if (!cancelled && !isRenderCancelled(err)) setFailed(true)
      })
      .finally(() => {
        offscreen.width = 0
        offscreen.height = 0
      })

    return () => {
      cancelled = true
      cancelRender?.()
    }
  }, [doc, pageNumber, masksKey])

  return (
    <figure className="page">
      <div className="page__sheet">
        <canvas ref={canvasRef} aria-label={`Page ${pageNumber}`} />
        <UnmaskedOutlines analysis={analysis} unmasked={unmasked} />
        {showOverlay && <DebugOverlay analysis={analysis} />}
      </div>
      <figcaption>
        {failed ? `Page ${pageNumber} could not be rendered.` : `Page ${pageNumber}`}
      </figcaption>
    </figure>
  )
}

// Unmasked zones keep a dotted outline, so the user sees what they chose
// to reveal. Drawn above the canvas: never part of the export.
function UnmaskedOutlines({ analysis, unmasked }: { analysis: PageAnalysis; unmasked: ReadonlySet<string> }) {
  const zones = analysis.zones.filter((zone) => unmasked.has(zone.key))
  if (zones.length === 0) return null
  const { width, height } = analysis.pageText
  return (
    <svg className="page__overlay" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" aria-hidden="true">
      {zones.map((zone, i) => (
        <rect
          key={i}
          className="unmasked-zone"
          x={zone.rect.x}
          y={zone.rect.y}
          width={zone.rect.width}
          height={zone.rect.height}
        />
      ))}
    </svg>
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
