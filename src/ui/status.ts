export type NerState =
  | { phase: 'idle' }
  | { phase: 'download'; loaded: number; total: number }
  | { phase: 'analyze'; done: number; total: number }
  | { phase: 'done' }
  | { phase: 'error'; message: string }

export type StatusPill = { label: string; tone: 'busy' | 'ready' | 'warning' }

// The status shown in the top bar, from the most to the least urgent.
export function statusPill({
  reading,
  exporting,
  ner,
}: {
  reading: boolean
  exporting: string | null
  ner: NerState
}): StatusPill {
  if (exporting) return { label: exporting, tone: 'busy' }
  if (reading) return { label: 'Reading pages…', tone: 'busy' }
  if (ner.phase === 'download') {
    const label = ner.total > 0 ? `Loading model ${Math.floor((ner.loaded / ner.total) * 100)}%` : 'Loading model…'
    return { label, tone: 'busy' }
  }
  if (ner.phase === 'analyze') return { label: `Finding names ${ner.done}/${ner.total}`, tone: 'busy' }
  if (ner.phase === 'error') return { label: 'Names not checked', tone: 'warning' }
  return { label: 'Ready', tone: 'ready' }
}

// Why the export button is disabled, or null when it is enabled.
export function exportBlocker({
  reading,
  exporting,
  ner,
}: {
  reading: boolean
  exporting: string | null
  ner: NerState
}): string | null {
  if (exporting) return 'An export is in progress.'
  if (reading) return 'Wait until the pages are read.'
  if (ner.phase === 'download' || ner.phase === 'analyze') {
    return 'Export unlocks once names and organizations are checked on every page.'
  }
  return null
}
