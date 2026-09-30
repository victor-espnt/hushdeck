import { useEffect, useState } from 'react'
import { runNerSmokeTest } from '../detect/nerSmokeTest.ts'
import { analyzeDocument, type PageAnalysis } from '../detect/analyzePage.ts'
import { downloadPdf, exportPdf } from '../export/exportPdf.ts'
import { loadErrorMessage, loadPdf, type PDFDocumentProxy } from '../pdf/loadPdf.ts'
import DropZone from './DropZone.tsx'
import OverlayLegend from './OverlayLegend.tsx'
import PageView from './PageView.tsx'

export default function App() {
  const [deck, setDeck] = useState<{ doc: PDFDocumentProxy; pages: PageAnalysis[] } | null>(null)
  const [status, setStatus] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [showOverlay, setShowOverlay] = useState(false)
  const [nerSummary, setNerSummary] = useState<string | null>(null)

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

  async function handleNerSmokeTest() {
    setError(null)
    setStatus('Running the NER smoke test… (see the console)')
    try {
      const result = await runNerSmokeTest()
      setStatus(null)
      setNerSummary(
        `NER smoke test: ${(result.downloadedBytes / 1e6).toFixed(1)} MB downloaded, ` +
          `load ${Math.round(result.loadMs)} ms, inference ${Math.round(result.inferenceMs)} ms. ` +
          `Details in the console.`,
      )
    } catch (err) {
      setStatus(null)
      setError(`NER smoke test failed: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  async function handleExport() {
    if (!deck) return
    setError(null)
    try {
      const bytes = await exportPdf(deck.doc, deck.pages, (pageNumber) =>
        setStatus(`Exporting page ${pageNumber} of ${deck.pages.length}…`),
      )
      downloadPdf(bytes)
    } catch {
      setError('The export failed.')
    } finally {
      setStatus(null)
    }
  }

  async function handleFile(file: File) {
    setError(null)
    setDeck(null)
    setStatus('Opening the PDF…')
    let doc: PDFDocumentProxy
    try {
      doc = await loadPdf(file)
    } catch (err) {
      setError(loadErrorMessage(err))
      setStatus(null)
      return
    }
    // Pages are shown only once their masks are known.
    setStatus('Finding sensitive items…')
    try {
      setDeck({ doc, pages: await analyzeDocument(doc) })
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
      <details className="debug">
        <summary>Debug</summary>
        <button type="button" onClick={handleNerSmokeTest} disabled={status !== null}>
          Run NER smoke test
        </button>
        {nerSummary && <p>{nerSummary}</p>}
      </details>
      {deck && (
        <section className="pages">
          <div className="toolbar">
            <button type="button" onClick={handleExport} disabled={status !== null}>
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
          {deck.pages.map((analysis, i) => (
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
