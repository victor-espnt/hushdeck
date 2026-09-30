import type { PageText } from './textIndex.ts'

// Above this, rendering and exporting every page at scale 2 strains the
// browser's memory.
export const MAX_FILE_BYTES = 50 * 1024 * 1024

const megabytes = (bytes: number) => `${Math.round(bytes / (1024 * 1024))} MB`

// A message when the file is too large to open, or null.
export function fileSizeProblem(size: number): string | null {
  if (size <= MAX_FILE_BYTES) return null
  return `This file is ${megabytes(size)}. Hushdeck opens PDFs up to ${megabytes(MAX_FILE_BYTES)}.`
}

// pdf.js errors are told apart by name, which also works across the worker
// boundary.
export function loadErrorMessage(err: unknown): string {
  const name = err instanceof Error ? err.name : ''
  if (name === 'PasswordException') {
    return 'This PDF is password-protected. Remove the password in the app that made it, then try again.'
  }
  return 'This file could not be read as a PDF.'
}

// Pages whose text layer is empty: scanned pages, or text turned into
// images. Nothing on them can be detected.
export function pagesWithoutText(pages: PageText[]): number[] {
  return pages.filter((page) => page.text.trim() === '').map((page) => page.pageNumber)
}

// A notice about pages without text, or null when every page has text.
export function textLayerNotice(pages: PageText[]): string | null {
  const missing = pagesWithoutText(pages)
  if (missing.length === 0) return null
  if (missing.length === pages.length) {
    return (
      'This PDF has no text layer: it is probably scanned or made of images, so there is ' +
      'nothing to detect. Drag on the pages to mask areas by hand.'
    )
  }
  const list = missing.length === 1 ? `Page ${missing[0]} has` : `Pages ${missing.join(', ')} have`
  return `${list} no text layer, so nothing can be detected there. Check them and drag on them to mask areas by hand.`
}
