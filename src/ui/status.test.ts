import { describe, expect, it } from 'vitest'
import { exportBlocker, statusPill, type NerState } from './status.ts'

const state = (ner: NerState, reading = false, exporting: string | null = null) => ({ ner, reading, exporting })

describe('statusPill', () => {
  it('follows the loading sequence', () => {
    expect(statusPill(state({ phase: 'idle' }, true)).label).toBe('Reading pages…')
    expect(statusPill(state({ phase: 'download', loaded: 0, total: 0 })).label).toBe('Loading model…')
    expect(statusPill(state({ phase: 'download', loaded: 55, total: 110 })).label).toBe('Loading model 50%')
    expect(statusPill(state({ phase: 'analyze', done: 4, total: 9 })).label).toBe('Finding names 4/9')
    expect(statusPill(state({ phase: 'done' }))).toEqual({ label: 'Ready', tone: 'ready' })
  })

  it('warns when the model failed, and shows an export first', () => {
    expect(statusPill(state({ phase: 'error', message: 'x' })).tone).toBe('warning')
    expect(statusPill(state({ phase: 'analyze', done: 1, total: 9 }, false, 'Exporting 2/9')).label).toBe('Exporting 2/9')
  })
})

describe('exportBlocker', () => {
  it('blocks the export until names are checked', () => {
    expect(exportBlocker(state({ phase: 'analyze', done: 4, total: 9 }))).toMatch(/names/)
    expect(exportBlocker(state({ phase: 'idle' }, true))).toMatch(/pages/)
    expect(exportBlocker(state({ phase: 'done' }))).toBeNull()
  })

  it('allows the export when the model failed or the PDF has no text', () => {
    expect(exportBlocker(state({ phase: 'error', message: 'x' }))).toBeNull()
    expect(exportBlocker(state({ phase: 'idle' }))).toBeNull()
  })
})
