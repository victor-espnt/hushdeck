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
  // Masks or unmasks a value everywhere in the deck.
  onToggle: (key: string) => void
  showOverlay: boolean
}

export default function PageView({
  doc,
  pageNumber,
  analysis,
  masks,
  unmasked,
  onToggle,
  showOverlay,
}: Props) {
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
        <ZoneLayer analysis={analysis} unmasked={unmasked} onToggle={onToggle} />
        {showOverlay && <DebugOverlay analysis={analysis} />}
      </div>
      <figcaption>
        {failed ? `Page ${pageNumber} could not be rendered.` : `Page ${pageNumber}`}
      </figcaption>
    </figure>
  )
}

// One click target per zone, above the canvas: clicking masks or unmasks
// the zone's value everywhere. Unmasked zones keep a dotted outline, so the
// user sees what they chose to reveal. Never part of the export.
function ZoneLayer({
  analysis,
  unmasked,
  onToggle,
}: {
  analysis: PageAnalysis
  unmasked: ReadonlySet<string>
  onToggle: (key: string) => void
}) {
  const { width, height } = analysis.pageText
  // Larger zones first, so a zone inside another stays clickable on top.
  const zones = [...analysis.zones].sort(
    (a, b) => b.rect.width * b.rect.height - a.rect.width * a.rect.height,
  )
  return (
    <svg className="page__overlay zone-layer" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none">
      {zones.map((zone, i) => {
        const isUnmasked = unmasked.has(zone.key)
        return (
          <rect
            key={i}
            className={isUnmasked ? 'zone zone--unmasked' : 'zone'}
            x={zone.rect.x}
            y={zone.rect.y}
            width={zone.rect.width}
            height={zone.rect.height}
            onClick={() => onToggle(zone.key)}
          >
            <title>{`${isUnmasked ? 'Mask' : 'Unmask'} "${zone.value}" everywhere`}</title>
          </rect>
        )
      })}
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
