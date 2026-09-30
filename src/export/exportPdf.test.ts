import { PDFDict, PDFDocument, PDFName } from 'pdf-lib'
import { describe, expect, it } from 'vitest'
import { assemblePdf, NEUTRAL_PRODUCER } from './exportPdf.ts'
import tinyJpeg from './fixtures/tiny.jpg?inline'

const jpeg = Uint8Array.from(atob(tinyJpeg.split(',')[1]), (char) => char.charCodeAt(0))

async function exported() {
  const bytes = await assemblePdf([
    { jpeg, width: 720, height: 405 },
    { jpeg, width: 612, height: 792 },
  ])
  return PDFDocument.load(bytes, { updateMetadata: false })
}

describe('assemblePdf', () => {
  it('keeps the original page sizes', async () => {
    const pdf = await exported()
    expect(pdf.getPages().map((page) => page.getSize())).toEqual([
      { width: 720, height: 405 },
      { width: 612, height: 792 },
    ])
  })

  it('writes neutral Producer and Creator, and no title, author, subject or dates', async () => {
    const pdf = await exported()
    expect(pdf.getProducer()).toBe(NEUTRAL_PRODUCER)
    expect(pdf.getCreator()).toBe(NEUTRAL_PRODUCER)
    expect(pdf.getTitle()).toBeUndefined()
    expect(pdf.getAuthor()).toBeUndefined()
    expect(pdf.getSubject()).toBeUndefined()
    expect(pdf.getKeywords()).toBeUndefined()
    expect(pdf.getCreationDate()).toBeUndefined()
    expect(pdf.getModificationDate()).toBeUndefined()
  })

  it('holds one image per page, with no font and no annotation', async () => {
    const pdf = await exported()
    for (const page of pdf.getPages()) {
      const resources = page.node.Resources()
      // pdf-lib writes an empty Font dictionary and Annots array on every page.
      const fonts = resources?.lookup(PDFName.of('Font'), PDFDict)
      expect(fonts?.keys() ?? []).toEqual([])
      expect(page.node.Annots()?.size() ?? 0).toBe(0)
      const xObjects = resources?.lookup(PDFName.of('XObject'), PDFDict)
      expect(xObjects?.keys()).toHaveLength(1)
      const image = xObjects?.lookup(xObjects.keys()[0])
      expect(image?.toString()).toContain('/Subtype /Image')
    }
  })
})
