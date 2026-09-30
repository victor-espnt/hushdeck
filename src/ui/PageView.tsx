import { useEffect, useRef, useState } from 'react'
import {
  isRenderCancelled,
  renderPageToCanvas,
  type PDFDocumentProxy,
} from '../pdf/loadPdf.ts'
import { blockRect, extractPageText, type PageText } from '../pdf/textIndex.ts'

type Props = {
  doc: PDFDocumentProxy
  pageNumber: number
  showBlocks: boolean
}

export default function PageView({ doc, pageNumber, showBlocks }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [failed, setFailed] = useState(false)
  const [pageText, setPageText] = useState<PageText | null>(null)

  useEffect(() => {
    let cancelled = false
    let cancelRender: (() => void) | undefined

    doc
      .getPage(pageNumber)
      .then((page) => {
        if (cancelled || !canvasRef.current) return
        const task = renderPageToCanvas(page, canvasRef.current)
        cancelRender = () => task.cancel()
        return task.promise
      })
      .catch((err: unknown) => {
        if (!cancelled && !isRenderCancelled(err)) setFailed(true)
      })

    return () => {
      cancelled = true
      cancelRender?.()
    }
  }, [doc, pageNumber])

  // Text is only extracted once the overlay is first shown.
  const needsText = showBlocks && pageText === null
  useEffect(() => {
    if (!needsText) return
    let cancelled = false
    doc
      .getPage(pageNumber)
      .then(extractPageText)
      .then((text) => {
        if (!cancelled) setPageText(text)
      })
      .catch(() => {
        // The overlay is a debug aid: a page without text blocks stays usable.
      })
    return () => {
      cancelled = true
    }
  }, [doc, pageNumber, needsText])

  return (
    <figure className="page">
      <div className="page__sheet">
        <canvas ref={canvasRef} aria-label={`Page ${pageNumber}`} />
        {showBlocks && pageText && <BlockOverlay pageText={pageText} />}
      </div>
      <figcaption>
        {failed ? `Page ${pageNumber} could not be rendered.` : `Page ${pageNumber}`}
      </figcaption>
    </figure>
  )
}

function BlockOverlay({ pageText }: { pageText: PageText }) {
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
              x={rect.x}
              y={rect.y}
              width={rect.width}
              height={rect.height}
            />
          )
        })}
    </svg>
  )
}
