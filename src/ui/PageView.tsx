import { useEffect, useRef, useState } from 'react'
import {
  isRenderCancelled,
  renderPageToCanvas,
  type PDFDocumentProxy,
} from '../pdf/loadPdf.ts'

type Props = {
  doc: PDFDocumentProxy
  pageNumber: number
}

export default function PageView({ doc, pageNumber }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [failed, setFailed] = useState(false)

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

  return (
    <figure className="page">
      <canvas ref={canvasRef} aria-label={`Page ${pageNumber}`} />
      <figcaption>
        {failed ? `Page ${pageNumber} could not be rendered.` : `Page ${pageNumber}`}
      </figcaption>
    </figure>
  )
}
