import Logo from './Logo.tsx'
import type { StatusPill } from './status.ts'

type Props = {
  fileName: string
  status: StatusPill
  onOpen: () => void
  onExport: () => void
  // Why the export is disabled, or null.
  exportBlocker: string | null
  busy: boolean
}

export default function TopBar({ fileName, status, onOpen, onExport, exportBlocker, busy }: Props) {
  return (
    <header className="topbar">
      <Logo size="small" />
      <span className="topbar__file" title={fileName}>
        {fileName}
      </span>
      <span className={`status-pill status-pill--${status.tone}`} role="status">
        {status.label}
      </span>
      <div className="topbar__actions">
        <button type="button" onClick={onOpen} disabled={busy}>
          Open another deck
        </button>
        {/* A disabled button shows no tooltip of its own: the wrapper does. */}
        <span className="tooltip" data-tip={exportBlocker ?? undefined}>
          <button
            type="button"
            className="button--primary"
            onClick={onExport}
            disabled={exportBlocker !== null}
            aria-describedby={exportBlocker ? 'export-blocker' : undefined}
          >
            Export anonymized PDF
          </button>
          {exportBlocker && (
            <span id="export-blocker" className="visually-hidden">
              {exportBlocker}
            </span>
          )}
        </span>
      </div>
    </header>
  )
}
