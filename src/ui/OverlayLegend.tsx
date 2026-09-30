const ENTRIES = [
  { className: 'overlay-block', label: 'Text block' },
  { className: 'overlay-email', label: 'Email' },
  { className: 'overlay-amount', label: 'Amount' },
  { className: 'overlay-percent', label: 'Percentage' },
]

export default function OverlayLegend() {
  return (
    <ul className="legend">
      {ENTRIES.map(({ className, label }) => (
        <li key={className}>
          <svg viewBox="0 0 14 14" aria-hidden="true">
            <rect className={className} x="1" y="1" width="12" height="12" />
          </svg>
          {label}
        </li>
      ))}
    </ul>
  )
}
