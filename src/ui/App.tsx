import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { analyzePage, extractDocumentText, maskedRects } from '../detect/analyzePage.ts'
import {
  findOccurrences,
  joinLineBreaks,
  nerDetections,
  termDetections,
  valueKey,
} from '../detect/merge.ts'
import type { NerEntity } from '../detect/ner.ts'
import type { NerHandlers } from '../detect/nerClient.ts'
import { buildReview } from '../detect/review.ts'
import { downloadPdf, exportPdf } from '../export/exportPdf.ts'
import { loadErrorMessage, loadPdf, type PDFDocumentProxy } from '../pdf/loadPdf.ts'
import type { PageText, Rect } from '../pdf/textIndex.ts'
import type { ManualArea } from '../render/manualArea.ts'
import DebugPanel from './DebugPanel.tsx'
import DropZone from './DropZone.tsx'
import NerProgress, { type NerState } from './NerProgress.tsx'
import OverlayLegend from './OverlayLegend.tsx'
import PageView from './PageView.tsx'
import ReviewPanel from './ReviewPanel.tsx'

type Deck = { doc: PDFDocumentProxy; pageTexts: PageText[] }

export default function App() {
  const [deck, setDeck] = useState<Deck | null>(null)
  // NER entities per page, filled in as the model finishes each page.
  const [entities, setEntities] = useState<NerEntity[][]>([])
  const [ner, setNer] = useState<NerState>({ phase: 'idle' })
  const [status, setStatus] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [showOverlay, setShowOverlay] = useState(false)
  // Values the user unchecked. Everything else is masked (fail closed).
  const [unmasked, setUnmasked] = useState<ReadonlySet<string>>(new Set())
  // Terms the user added with "Mask this term too".
  const [customTerms, setCustomTerms] = useState<string[]>([])
  // Areas drawn by hand, always masked until removed.
  const [manualAreas, setManualAreas] = useState<ManualArea[]>([])
  const nextAreaId = useRef(1)
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
    const joined = deck.pageTexts.map((page, i) => joinLineBreaks(page, entities[i] ?? []))
    const found = nerDetections(texts, joined)
    const custom = termDetections(texts, customTerms)
    return deck.pageTexts.map((page, i) => analyzePage(page, [...found[i], ...custom[i]]))
  }, [deck, entities, customTerms])

  const review = useMemo(() => buildReview(pages), [pages])
  // Fail closed: a value is masked unless the user unchecked every row it
  // belongs to.
  const isMasked = useCallback(
    (key: string) => !review.rowsOf(key).every((row) => unmasked.has(row)),
    [review, unmasked],
  )
  const masks = useMemo(
    () =>
      pages.map((page, i) => [
        ...maskedRects(page, isMasked),
        ...manualAreas.filter((area) => area.page === i).map((area) => area.rect),
      ]),
    [pages, isMasked, manualAreas],
  )

  function drawArea(page: number, rect: Rect) {
    setManualAreas((areas) => [...areas, { id: nextAreaId.current++, page, rect }])
  }

  function removeArea(id: number) {
    setManualAreas((areas) => areas.filter((area) => area.id !== id))
  }
  const labels = useMemo(
    () => new Map(review.groups.flatMap((group) => group.rows.map((row) => [row.key, row.value]))),
    [review],
  )

  function setMasked(keys: string[], masked: boolean) {
    setUnmasked((previous) => {
      const next = new Set(previous)
      for (const key of keys) {
        if (masked) next.delete(key)
        else next.add(key)
      }
      return next
    })
  }

  // Returns a message when the term cannot be added.
  function addTerm(input: string): string | null {
    const term = input.replace(/\s+/g, ' ').trim()
    if (!deck || term === '') return null
    if (!deck.pageTexts.some((page) => findOccurrences(page.text, term).length > 0)) {
      return `"${term}" does not appear in the text of this deck.`
    }
    if (!customTerms.some((existing) => valueKey(existing) === valueKey(term))) {
      setCustomTerms([...customTerms, term])
    }
    // Adding a term the user had unmasked masks it again.
    setMasked(review.rowsOf(valueKey(term)), true)
    return null
  }

  // A click on a zone flips every row its value belongs to.
  function toggle(key: string) {
    setMasked(review.rowsOf(key), !isMasked(key))
  }

  const nerRunning = ner.phase === 'download' || ner.phase === 'analyze'

  function runNer(pageTexts: PageText[]) {
    const current = ++run.current
    const texts = pageTexts.map((page) => page.text)
    setEntities([])
    setNer({ phase: 'download', loaded: 0, total: 0 })
    const handlers: NerHandlers = {
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
    }
    // The NER client, and its inline worker, load on demand.
    import('../detect/nerClient.ts')
      .then(({ detectEntities }) => detectEntities(texts, handlers))
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
      const exportPages = pages.map((page, i) => ({
        width: page.pageText.width,
        height: page.pageText.height,
        masks: masks[i],
      }))
      const bytes = await exportPdf(deck.doc, exportPages, (pageNumber) =>
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
    setUnmasked(new Set())
    setCustomTerms([])
    setManualAreas([])
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
        <div className="workspace">
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
                masks={masks[i]}
                isMasked={isMasked}
                labelOf={(key) => review.rowsOf(key).map((row) => labels.get(row) ?? row).join(', ')}
                onToggle={toggle}
                manualAreas={manualAreas.filter((area) => area.page === i)}
                onDrawArea={(rect) => drawArea(i, rect)}
                showOverlay={showOverlay}
              />
            ))}
          </section>
          <ReviewPanel
            groups={review.groups}
            unmasked={unmasked}
            onChange={setMasked}
            onAddTerm={addTerm}
            manualAreas={manualAreas}
            onRemoveArea={removeArea}
          />
        </div>
      )}
    </main>
  )
}
