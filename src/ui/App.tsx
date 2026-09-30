import { useEffect, useState } from 'react'
import { loadErrorMessage, loadPdf, type PDFDocumentProxy } from '../pdf/loadPdf.ts'
import DropZone from './DropZone.tsx'
import OverlayLegend from './OverlayLegend.tsx'
import PageView from './PageView.tsx'

export default function App() {
  const [doc, setDoc] = useState<PDFDocumentProxy | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showBlocks, setShowBlocks] = useState(false)

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
      doc?.loadingTask.destroy()
    }
  }, [doc])

  async function handleFile(file: File) {
    setLoading(true)
    setError(null)
    setDoc(null)
    try {
      setDoc(await loadPdf(file))
    } catch (err) {
      setError(loadErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="app">
      <h1>Hushdeck</h1>
      <p>Anonymize pitch decks in your browser. Nothing leaves your device.</p>
      <DropZone onFile={handleFile} disabled={loading} />
      {loading && <p role="status">Opening the PDF…</p>}
      {error && <p role="alert" className="error">{error}</p>}
      {doc && (
        <section className="pages">
          <label className="toggle">
            <input
              type="checkbox"
              checked={showBlocks}
              onChange={(event) => setShowBlocks(event.target.checked)}
            />
            Show debug overlay
          </label>
          {showBlocks && <OverlayLegend />}
          {Array.from({ length: doc.numPages }, (_, i) => (
            <PageView key={i + 1} doc={doc} pageNumber={i + 1} showBlocks={showBlocks} />
          ))}
        </section>
      )}
    </main>
  )
}
