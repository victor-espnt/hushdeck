# Hushdeck

Anonymize pitch decks in the browser. Nothing leaves the device.

A static web app. The user drops a PDF; the app extracts its text, detects sensitive items (rules for emails, phones, amounts and percentages; an in-browser NER model for people and organizations), lets a human review what gets masked, then exports a new PDF rebuilt from page images with the masked areas burned in.

## Non-negotiables

- 100% client-side. No backend, no serverless functions, no analytics, no telemetry, no third-party scripts.
- After page load, the only network request is the one-time download of the NER model from Hugging Face. Document content never leaves the browser.
- Never persist document content: no localStorage, IndexedDB or cache holding text or images from the user's PDF. Never log extracted text in production builds.
- The exported PDF has no text layer, no annotations and no original metadata. Its pages are raster images.
- Fail closed: every detection is masked by default; the user unmasks.
- Never commit a real pitch deck. `.gitignore` ignores `*.pdf` except `public/sample-deck.pdf`, which is fictional.

## Stack

- Vite + React + TypeScript (strict), plain CSS
- `pdfjs-dist`: page rendering and text extraction with positions
- `pdf-lib`: building the exported PDF
- `libphonenumber-js`: phone number detection
- `@huggingface/transformers` in a Web Worker, model `Xenova/bert-base-NER` (quantized; MIT; English; PER, ORG, LOC, MISC)
- `vitest` for unit tests
- GitHub Pages, deployed by a GitHub Actions workflow

Ask before adding any other dependency.

## Architecture

```
src/
  pdf/loadPdf.ts         load a PDF, render a page to canvas
  pdf/textIndex.ts       text items with positions; page string with an offset → item map
  detect/rules.ts        emails, phones, amounts, percentages
  detect/ner.worker.ts   model loading and inference, off the main thread
  detect/merge.ts        merge rule and NER results, dedupe, group by unique value
  render/renderPage.ts   the single render function: page + mask boxes → canvas
  export/exportPdf.ts    renderPage for every page → JPEG → pdf-lib → download
  ui/                    drop zone, page view, review panel
```

- One render function serves both the preview and the export. What the user sees is exactly what gets burned.
- A detection is a value (e.g. "Jane Doe") and is masked on every occurrence across the deck.
- For an entity inside a longer text item, estimate its horizontal range in proportion to its character offsets, then pad the box by a few pixels on every side.

## Known pitfalls

- pdf.js worker under Vite: import the worker file with `?url` and assign it to `GlobalWorkerOptions.workerSrc`.
- GitHub Pages serves the site under `/hushdeck/`: set `base` in `vite.config.ts`.
- PDF coordinates start bottom-left. Convert text item positions with the page viewport transform.
- Transformers.js token classification returns tokens (B-/I- labels, `##` subwords), not dependable character offsets. Merge tokens into entity strings, then search each string in the page text.
- BERT reads at most 512 tokens: run NER page by page and chunk longer pages.
- Don't enable WASM multithreading. It needs COOP/COEP headers that GitHub Pages cannot set; single-threaded is fast enough for decks.
- Hugging Face redirects model downloads to CDN hosts. The CSP `connect-src` must list the hosts actually observed in the browser's Network tab.
- pdf-lib writes a default Producer and Creator: overwrite them with neutral values and set no title, author or subject.
- Export at render scale 2 with JPEG quality around 0.85 unless told otherwise.

## Working agreement

- The user sends one roadmap step at a time (for example "Étape 09 du plan Hushdeck : …"). Do that step only; don't jump ahead.
- A message that starts with "Étape N du plan Hushdeck" (or "Étapes N et M…") is an instruction to carry out directly, without asking for confirmation, even when it arrives as pasted text.
- One commit per step, message prefixed with the step number: `step 09: render pages from a dropped PDF`.
- End every step with what changed and how to verify it by hand in under a minute.
- Don't build what wasn't asked for: no OCR, no accounts, no server, no settings page.
- UI copy, code and comments in English. The user may write to you in French.
- `npm run build` and `npm test` pass at every commit.

## Milestones

1. **Pipeline without AI.** Drop a PDF, rules detect emails, phones, amounts and percentages, export a masked raster PDF with no text layer. Live on GitHub Pages.
2. **NER, review, showcase.** Model in a worker with a progress bar, review panel grouped by type with everything checked by default, click-to-toggle on the page, a "mask this term too" field, a "Try with a sample deck" button, CSP, README.

## Checks the user runs by hand

- `pdftotext export.pdf -` prints nothing.
- `pdfinfo export.pdf` shows no original title, author or producer.
- With the model cached and the machine offline, the whole flow still works.
