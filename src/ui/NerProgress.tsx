export type NerState =
  | { phase: 'idle' }
  | { phase: 'download'; loaded: number; total: number }
  | { phase: 'analyze'; done: number; total: number }
  | { phase: 'done' }
  | { phase: 'error'; message: string }

const megabytes = (bytes: number) => `${Math.round(bytes / 1e6)} MB`

// Two phases: the one-time model download, then the analysis of each page.
export default function NerProgress({ state }: { state: NerState }) {
  if (state.phase === 'error') {
    return (
      <p role="alert" className="error">
        Names and organizations could not be checked ({state.message}). Only emails, phone
        numbers, amounts and percentages are masked.
      </p>
    )
  }
  if (state.phase !== 'download' && state.phase !== 'analyze') return null

  const label =
    state.phase === 'download'
      ? state.total > 0
        ? `Loading the name detection model: ${megabytes(state.loaded)} of ${megabytes(state.total)} (downloaded once, then kept by your browser)`
        : 'Loading the name detection model…'
      : `Finding names and organizations: page ${state.done} of ${state.total}`
  const [value, max] =
    state.phase === 'download' ? [state.loaded, state.total] : [state.done, state.total]

  return (
    <div className="ner-progress" role="status">
      <span>{label}</span>
      {/* No value while the total is unknown: an indeterminate bar. */}
      <progress value={max > 0 ? value : undefined} max={max > 0 ? max : undefined} />
      <span className="ner-progress__note">Export is available once this is done.</span>
    </div>
  )
}
