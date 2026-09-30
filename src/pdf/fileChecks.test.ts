import { describe, expect, it } from 'vitest'
import { fileSizeProblem, loadErrorMessage, MAX_FILE_BYTES, textLayerNotice } from './fileChecks.ts'
import { buildPageText } from './textIndex.ts'

const viewport = { width: 720, height: 405, transform: [1, 0, 0, -1, 0, 405] }
const page = (n: number, str: string) =>
  buildPageText(
    str ? [{ str, transform: [12, 0, 0, 12, 40, 300], width: 60, height: 12, hasEOL: false }] : [],
    viewport,
    n,
  )

describe('fileSizeProblem', () => {
  it('accepts a file up to the limit', () => {
    expect(fileSizeProblem(MAX_FILE_BYTES)).toBeNull()
  })

  it('refuses a larger file, with both sizes', () => {
    expect(fileSizeProblem(123 * 1024 * 1024)).toBe('This file is 123 MB. Hushdeck opens PDFs up to 50 MB.')
  })
})

describe('loadErrorMessage', () => {
  const named = (name: string) => Object.assign(new Error('x'), { name })

  it('explains a password-protected PDF', () => {
    expect(loadErrorMessage(named('PasswordException'))).toMatch(/password-protected/)
  })

  it('falls back to a generic message', () => {
    expect(loadErrorMessage(named('InvalidPDFException'))).toBe('This file could not be read as a PDF.')
    expect(loadErrorMessage('boom')).toBe('This file could not be read as a PDF.')
  })
})

describe('textLayerNotice', () => {
  it('says nothing when every page has text', () => {
    expect(textLayerNotice([page(1, 'Hello'), page(2, 'World')])).toBeNull()
  })

  it('points to manual areas when no page has text', () => {
    expect(textLayerNotice([page(1, ''), page(2, '')])).toMatch(/no text layer.*nothing to detect.*by hand/)
  })

  it('lists the pages without text', () => {
    expect(textLayerNotice([page(1, 'Hello'), page(2, ''), page(3, ' ')])).toMatch(/^Pages 2, 3 have no text layer/)
    expect(textLayerNotice([page(1, ''), page(2, 'Hi')])).toMatch(/^Page 1 has no text layer/)
  })
})
