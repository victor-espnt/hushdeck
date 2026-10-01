import { useEffect, useRef, useState, type PointerEvent } from 'react'
import type { PageAnalysis } from '../detect/analyzePage.ts'
import type { Rect } from '../pdf/textIndex.ts'
import { isRenderCancelled, type PDFDocumentProxy } from '../pdf/loadPdf.ts'
import { blockRect, rangeToRects } from '../pdf/textIndex.ts'
import { manualAreaKey, rectFromCorners, type ManualArea } from '../render/manualArea.ts'
import { renderPage } from '../render/renderPage.ts'

type Props = {
  doc: PDFDocumentProxy
  pageNumber: number
  pageCount: number
  analysis: PageAnalysis
  // The areas burned in black, as in the export.
  masks: Rect[]
  isMasked: (key: string) => boolean
  // Zones of the review row under the pointer, drawn in yellow.
  isHighlighted: (key: string) => boolean
  // The review row(s) a value belongs to, for the tooltip.
  labelOf: (key: string) => string
  // Masks or unmasks a value everywhere in the deck.
  onToggle: (key: string) => void
  // Areas drawn by hand on this page; they are part of `masks`.
  manualAreas: ManualArea[]
  onDrawArea: (rect: Rect) => void
  showOverlay: boolean
}

export default function PageView({
  doc,
  pageNumber,
  pageCount,
  analysis,
  masks,
  isMasked,
  isHighlighted,
  labelOf,
  onToggle,
  manualAreas,
  onDrawArea,
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
      <div className="page__sheet" id={`page-${pageNumber}`}>
        <canvas ref={canvasRef} aria-label={`Page ${pageNumber}`} />
        <DrawLayer
          width={analysis.pageText.width}
          height={analysis.pageText.height}
          manualAreas={manualAreas}
          isHighlighted={isHighlighted}
          onDrawArea={onDrawArea}
        />
        <ZoneLayer
          analysis={analysis}
          isMasked={isMasked}
          isHighlighted={isHighlighted}
          labelOf={labelOf}
          onToggle={onToggle}
        />
        {showOverlay && <DebugOverlay analysis={analysis} />}
      </div>
      <figcaption className="page__number">
        {failed ? `Page ${pageNumber} could not be rendered.` : `${pageNumber} / ${pageCount}`}
      </figcaption>
    </figure>
  )
}

// Dragging on the page, outside a detected zone, draws a manual area.
function DrawLayer({
  width,
  height,
  manualAreas,
  isHighlighted,
  onDrawArea,
}: { width: number; height: number } & Pick<Props, 'manualAreas' | 'isHighlighted' | 'onDrawArea'>) {
  const [drag, setDrag] = useState<{ x0: number; y0: number; x1: number; y1: number } | null>(null)

  // Pointer position in page units.
  function toPage(event: PointerEvent<SVGSVGElement>) {
    const box = event.currentTarget.getBoundingClientRect()
    return {
      x: ((event.clientX - box.left) / box.width) * width,
      y: ((event.clientY - box.top) / box.height) * height,
    }
  }

  // Escape cancels a drag in progress.
  const dragging = drag !== null
  useEffect(() => {
    if (!dragging) return
    const cancel = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setDrag(null)
    }
    window.addEventListener('keydown', cancel)
    return () => window.removeEventListener('keydown', cancel)
  }, [dragging])

  const preview = drag && rectFromCorners(drag.x0, drag.y0, drag.x1, drag.y1, width, height)

  return (
    <svg
      className="page__overlay draw-layer"
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      onPointerDown={(event) => {
        if (event.button !== 0) return
        event.currentTarget.setPointerCapture(event.pointerId)
        const { x, y } = toPage(event)
        setDrag({ x0: x, y0: y, x1: x, y1: y })
      }}
      onPointerMove={(event) => {
        if (!drag) return
        const { x, y } = toPage(event)
        setDrag({ ...drag, x1: x, y1: y })
      }}
      onPointerUp={() => {
        if (preview) onDrawArea(preview)
        setDrag(null)
      }}
      onPointerCancel={() => setDrag(null)}
    >
      {manualAreas.map((area) => (
        <rect
          key={area.id}
          className={isHighlighted(manualAreaKey(area.id)) ? 'manual-area manual-area--highlight' : 'manual-area'}
          x={area.rect.x}
          y={area.rect.y}
          width={area.rect.width}
          height={area.rect.height}
        />
      ))}
      {preview && (
        <rect
          className="manual-area manual-area--drawing"
          x={preview.x}
          y={preview.y}
          width={preview.width}
          height={preview.height}
        />
      )}
    </svg>
  )
}

// One click target per zone, above the canvas: clicking masks or unmasks
// the zone's value everywhere. Unmasked zones keep a dotted outline, so the
// user sees what they chose to reveal. Never part of the export.
function ZoneLayer({
  analysis,
  isMasked,
  isHighlighted,
  labelOf,
  onToggle,
}: {
  analysis: PageAnalysis
} & Pick<Props, 'isMasked' | 'isHighlighted' | 'labelOf' | 'onToggle'>) {
  const { width, height } = analysis.pageText
  // Larger zones first, so a zone inside another stays clickable on top.
  const zones = [...analysis.zones].sort(
    (a, b) => b.rect.width * b.rect.height - a.rect.width * a.rect.height,
  )
  return (
    <svg className="page__overlay zone-layer" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none">
      {zones.map((zone, i) => {
        const isUnmasked = !isMasked(zone.key)
        return (
          <rect
            key={i}
            className={[
              'zone',
              isUnmasked && 'zone--unmasked',
              isHighlighted(zone.key) && 'zone--highlight',
            ]
              .filter(Boolean)
              .join(' ')}
            x={zone.rect.x}
            y={zone.rect.y}
            width={zone.rect.width}
            height={zone.rect.height}
            onClick={() => onToggle(zone.key)}
          >
            <title>{`${isUnmasked ? 'Mask' : 'Unmask'} "${labelOf(zone.key)}" everywhere`}</title>
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
