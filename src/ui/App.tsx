import { useEffect, useMemo, useRef, useState } from 'react'
import { analyzePage, extractDocumentText } from '../detect/analyzePage.ts'
import { nerDetections } from '../detect/merge.ts'
import type { NerEntity } from '../detect/ner.ts'
import { detectEntities } from '../detect/nerClient.ts'
import { downloadPdf, exportPdf } from '../export/exportPdf.ts'
import { loadErrorMessage, loadPdf, type PDFDocumentProxy } from '../pdf/loadPdf.ts'
import type { PageText } from '../pdf/textIndex.ts'
import DebugPanel from './DebugPanel.tsx'
import DropZone from './DropZone.tsx'
import NerProgress, { type NerState } from './NerProgress.tsx'
import OverlayLegend from './OverlayLegend.tsx'
import PageView from './PageView.tsx'

type Deck = { doc: PDFDocumentProxy; pageTexts: PageText[] }

export default function App() {
  const [deck, setDeck] = useState<Deck | null>(null)
  // NER entities per page, filled in as the model finishes each page.
  const [entities, setEntities] = useState<NerEntity[][]>([])
  const [ner, setNer] = useState<NerState>({ phase: 'idle' })
  const [status, setStatus] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [showOverlay, setShowOverlay] = useState(false)
  // Ignores NER results that belong to a previous document.
  const run = useRef(0)

  // A file dropped outside the drop zone must not make the browser open it.
  useEffect(() => {
    const block = (event: DragEvent) => event.preventDefault()
    window.addEventListener('dragover', block)
    window.addEventListener('drop', block)
    return () => {
      window.removeEventListener('dragover', block)
      window.removeEventListener('drop', block)
    }
  }, [])

  // Release the previous document when it is replaced or the app unmounts.
  useEffect(() => {
    return () => {
      deck?.doc.loadingTask.destroy()
    }
  }, [deck])

  // Rules apply at once; NER detections join as they arrive. A NER value
  // is masked on every page, so every page is analyzed again.
  const pages = useMemo(() => {
    if (!deck) return []
    const texts = deck.pageTexts.map((page) => page.text)
    const found = nerDetections(texts, entities)
    return deck.pageTexts.map((page, i) => analyzePage(page, found[i]))
  }, [deck, entities])

  const nerRunning = ner.phase === 'download' || ner.phase === 'analyze'

  function runNer(pageTexts: PageText[]) {
    const current = ++run.current
    const texts = pageTexts.map((page) => page.text)
    setEntities([])
    setNer({ phase: 'download', loaded: 0, total: 0 })
    detectEntities(texts, {
      onDownload: (loaded, total) => {
        if (run.current === current) setNer({ phase: 'download', loaded, total })
      },
      onPage: (pageIndex, found) => {
        if (run.current !== current) return
        setEntities((previous) => {
          const next = [...previous]
          next[pageIndex] = found
          return next
        })
        setNer({ phase: 'analyze', done: pageIndex + 1, total: texts.length })
      },
    })
      .then(() => {
        if (run.current === current) setNer({ phase: 'done' })
      })
      .catch((err: unknown) => {
        if (run.current === current) {
          setNer({ phase: 'error', message: err instanceof Error ? err.message : String(err) })
        }
      })
  }

  async function handleExport() {
    if (!deck) return
    setError(null)
    try {
      const bytes = await exportPdf(deck.doc, pages, (pageNumber) =>
        setStatus(`Exporting page ${pageNumber} of ${pages.length}…`),
      )
      downloadPdf(bytes)
    } catch {
      setError('The export failed.')
    } finally {
      setStatus(null)
    }
  }

  async function handleFile(file: File) {
    run.current++
    setError(null)
    setDeck(null)
    setNer({ phase: 'idle' })
    setStatus('Opening the PDF…')
    let doc: PDFDocumentProxy
    try {
      doc = await loadPdf(file)
    } catch (err) {
      setError(loadErrorMessage(err))
      setStatus(null)
      return
    }
    // Pages are shown only once their text is read, so rule masks are
    // there from the first paint.
    setStatus('Reading the text…')
    try {
      const pageTexts = await extractDocumentText(doc)
      setDeck({ doc, pageTexts })
      runNer(pageTexts)
    } catch {
      doc.loadingTask.destroy()
      setError('The text of this PDF could not be read.')
    } finally {
      setStatus(null)
    }
  }

  return (
    <main className="app">
      <h1>Hushdeck</h1>
      <p>Anonymize pitch decks in your browser. Nothing leaves your device.</p>
      <DropZone onFile={handleFile} disabled={status !== null} />
      {status && <p role="status">{status}</p>}
      {error && <p role="alert" className="error">{error}</p>}
      <DebugPanel />
      {deck && (
        <section className="pages">
          <NerProgress state={ner} />
          <div className="toolbar">
            <button type="button" onClick={handleExport} disabled={status !== null || nerRunning}>
              Export anonymized PDF
            </button>
            <label className="toggle">
              <input
                type="checkbox"
                checked={showOverlay}
                onChange={(event) => setShowOverlay(event.target.checked)}
              />
              Show debug overlay
            </label>
          </div>
          {showOverlay && <OverlayLegend />}
          {pages.map((analysis, i) => (
            <PageView
              key={i + 1}
              doc={deck.doc}
              pageNumber={i + 1}
              analysis={analysis}
              showOverlay={showOverlay}
            />
          ))}
        </section>
      )}
    </main>
  )
}
