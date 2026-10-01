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
import { downloadPdf, EXPORT_FILE_NAME, exportPdf } from '../export/exportPdf.ts'
import { fileSizeProblem, loadErrorMessage, textLayerNotice } from '../pdf/fileChecks.ts'
import { loadPdf, type PDFDocumentProxy } from '../pdf/loadPdf.ts'
import type { PageText, Rect } from '../pdf/textIndex.ts'
import { manualAreaKey, type ManualArea } from '../render/manualArea.ts'
import DebugPanel from './DebugPanel.tsx'
import Home from './Home.tsx'
import PageView from './PageView.tsx'
import ReviewPanel from './ReviewPanel.tsx'
import { exportBlocker, statusPill, type NerState } from './status.ts'
import TopBar from './TopBar.tsx'

type Deck = {
  doc: PDFDocumentProxy
  // Shown in the top bar only, never in the export.
  fileName: string
  // Null while the text is read: no page shows before its masks are known.
  pageTexts: PageText[] | null
  // Pages without a text layer, where nothing can be detected.
  textNotice: string | null
}

export default function App() {
  const [deck, setDeck] = useState<Deck | null>(null)
  // NER entities per page, filled in as the model finishes each page.
  const [entities, setEntities] = useState<NerEntity[][]>([])
  const [ner, setNer] = useState<NerState>({ phase: 'idle' })
  // Opening a file (home screen).
  const [status, setStatus] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  // "Exporting 3/9" while an export runs.
  const [exporting, setExporting] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  // The review row under the pointer or the keyboard focus.
  const [highlighted, setHighlighted] = useState<string | null>(null)
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
  // One file input for every "choose a PDF" control.
  const fileInput = useRef<HTMLInputElement>(null)
  const openPicker = () => fileInput.current?.click()

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
  const doc = deck?.doc
  useEffect(() => {
    return () => {
      doc?.loadingTask.destroy()
    }
  }, [doc])

  // The export toast fades after a few seconds.
  useEffect(() => {
    if (!toast) return
    const timer = setTimeout(() => setToast(null), 5000)
    return () => clearTimeout(timer)
  }, [toast])

  // Rules apply at once; NER detections join as they arrive. A NER value
  // is masked on every page, so every page is analyzed again.
  const pages = useMemo(() => {
    const pageTexts = deck?.pageTexts
    if (!pageTexts) return []
    const texts = pageTexts.map((page) => page.text)
    const joined = pageTexts.map((page, i) => joinLineBreaks(page, entities[i] ?? []))
    const found = nerDetections(texts, joined)
    const custom = termDetections(texts, customTerms)
    return pageTexts.map((page, i) => analyzePage(page, [...found[i], ...custom[i]]))
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

  // Zones of the highlighted row, on every page; for a manual area, itself.
  const isHighlighted = useCallback(
    (key: string) => highlighted !== null && (key === highlighted || review.rowsOf(key).includes(highlighted)),
    [highlighted, review],
  )

  // Scrolls the pages to a row's first occurrence.
  function reveal(key: string) {
    let target: { page: number; rect: Rect } | undefined
    const area = manualAreas.find((candidate) => manualAreaKey(candidate.id) === key)
    if (area) target = area
    else {
      for (const [page, analysis] of pages.entries()) {
        const zone = analysis.zones.find((candidate) => review.rowsOf(candidate.key).includes(key))
        if (zone) {
          target = { page, rect: zone.rect }
          break
        }
      }
    }
    const sheet = target && document.getElementById(`page-${target.page + 1}`)
    if (!target || !sheet) return
    const box = sheet.getBoundingClientRect()
    const y = box.top + window.scrollY + (target.rect.y / pages[target.page].pageText.height) * box.height
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    window.scrollTo({ top: y - window.innerHeight / 3, behavior: reduced ? 'auto' : 'smooth' })
  }

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
    if (!deck?.pageTexts || term === '') return null
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

  const reading = deck !== null && deck.pageTexts === null

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
    setExporting(`Exporting 1/${pages.length}`)
    try {
      const exportPages = pages.map((page, i) => ({
        width: page.pageText.width,
        height: page.pageText.height,
        masks: masks[i],
      }))
      const bytes = await exportPdf(deck.doc, exportPages, (pageNumber) =>
        setExporting(`Exporting ${pageNumber}/${pages.length}`),
      )
      downloadPdf(bytes)
      setToast(`${EXPORT_FILE_NAME} saved. Nothing left your device.`)
    } catch {
      setError('The export failed.')
    } finally {
      setExporting(null)
    }
  }

  // The fictional deck shipped with the site, loaded like a dropped file.
  async function handleSample() {
    setError(null)
    setStatus('Loading the sample deck…')
    try {
      const response = await fetch(`${import.meta.env.BASE_URL}sample-deck.pdf`)
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      const blob = await response.blob()
      await handleFile(new File([blob], 'sample-deck.pdf', { type: 'application/pdf' }))
    } catch {
      setStatus(null)
      setError('The sample deck could not be loaded.')
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
    const tooLarge = fileSizeProblem(file.size)
    if (tooLarge) {
      setError(tooLarge)
      setStatus(null)
      return
    }
    setStatus('Opening the PDF…')
    let doc: PDFDocumentProxy
    try {
      doc = await loadPdf(file)
    } catch (err) {
      setError(loadErrorMessage(err))
      setStatus(null)
      return
    }
    // The working screen opens at once; pages show only once their text
    // is read, so rule masks are there from the first paint.
    setStatus(null)
    const current = run.current
    setDeck({ doc, fileName: file.name, pageTexts: null, textNotice: null })
    try {
      const pageTexts = await extractDocumentText(doc)
      if (run.current !== current) return
      setDeck({ doc, fileName: file.name, pageTexts, textNotice: textLayerNotice(pageTexts) })
      // Without any text, there is nothing for the model to read.
      if (pageTexts.some((page) => page.text.trim() !== '')) runNer(pageTexts)
    } catch {
      if (run.current !== current) return
      setDeck(null)
      setError('The text of this PDF could not be read.')
    }
  }

  const picker = (
    <input
      ref={fileInput}
      type="file"
      accept="application/pdf,.pdf"
      hidden
      onChange={(event) => {
        const file = event.target.files?.[0]
        if (file) handleFile(file)
        // Allow picking the same file again.
        event.target.value = ''
      }}
    />
  )

  if (!deck) {
    return (
      <>
        <Home
          onFile={handleFile}
          onSample={handleSample}
          onOpenPicker={openPicker}
          status={status}
          error={error}
        />
        <div className="home__debug">
          <DebugPanel showOverlay={showOverlay} onShowOverlay={setShowOverlay} />
        </div>
        {picker}
      </>
    )
  }

  const nerFailure =
    ner.phase === 'error'
      ? `Names and organizations could not be checked (${ner.message}). Only emails, phone numbers, amounts and percentages are masked.`
      : null

  return (
    <div className="work">
      <TopBar
        fileName={deck.fileName}
        status={statusPill({ reading, exporting, ner })}
        onOpen={openPicker}
        onExport={handleExport}
        exportBlocker={exportBlocker({ reading, exporting, ner })}
        busy={exporting !== null}
      />
      {picker}
      <main className="workspace">
        <section className="pages" aria-label="Pages">
          {[error, nerFailure, deck.textNotice].filter(Boolean).map((message) => (
            <p key={message} role="alert" className="notice">
              {message}
            </p>
          ))}
          {reading && <p className="pages__placeholder">Reading pages…</p>}
          {pages.map((analysis, i) => (
            <PageView
              key={i + 1}
              doc={deck.doc}
              pageNumber={i + 1}
              pageCount={pages.length}
              analysis={analysis}
              masks={masks[i]}
              isMasked={isMasked}
              isHighlighted={isHighlighted}
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
          onHighlight={setHighlighted}
          onReveal={reveal}
        />
      </main>
      <footer className="work__debug">
        <DebugPanel showOverlay={showOverlay} onShowOverlay={setShowOverlay} />
      </footer>
      {toast && (
        <div className="toast" role="status">
          {toast}
        </div>
      )}
    </div>
  )
}
