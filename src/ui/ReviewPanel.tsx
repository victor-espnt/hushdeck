import { useEffect, useId, useRef, useState, type FormEvent, type ReactNode } from 'react'
import type { ReviewGroup } from '../detect/review.ts'
import { manualAreaKey, type ManualArea } from '../render/manualArea.ts'

type Props = {
  groups: ReviewGroup[]
  // Keys of the values the user chose to leave visible.
  unmasked: ReadonlySet<string>
  onChange: (keys: string[], masked: boolean) => void
  // Masks a term everywhere; returns a message when it cannot.
  onAddTerm: (term: string) => string | null
  manualAreas: ManualArea[]
  onRemoveArea: (id: number) => void
  // Highlights a row's zones on the pages (null: none).
  onHighlight: (key: string | null) => void
  // Scrolls the pages to a row's first occurrence.
  onReveal: (key: string) => void
}

// Checked means masked. Everything starts checked (fail closed).
export default function ReviewPanel({
  groups,
  unmasked,
  onChange,
  onAddTerm,
  manualAreas,
  onRemoveArea,
  onHighlight,
  onReveal,
}: Props) {
  return (
    <aside className="review" aria-label="Review what gets masked">
      <h2>Masked in the export</h2>
      <CustomTermForm onAddTerm={onAddTerm} />
      {groups.length === 0 && <p className="review__empty">Nothing detected yet.</p>}
      {groups.map((group) => {
        const keys = group.rows.map((row) => row.key)
        return (
          <Group
            key={group.type}
            label={group.label}
            count={`${keys.filter((key) => !unmasked.has(key)).length}/${keys.length}`}
            selection={{ keys, unmasked, onChange }}
          >
            {group.rows.map((row) => (
              <Row
                key={row.key}
                rowKey={row.key}
                label={row.value}
                onHighlight={onHighlight}
                onReveal={onReveal}
                control={
                  <input
                    type="checkbox"
                    checked={!unmasked.has(row.key)}
                    onChange={(event) => onChange([row.key], event.target.checked)}
                    aria-label={`Mask ${row.value}`}
                  />
                }
                end={
                  <span className="review__count" title={`${row.count} occurrences in the deck`}>
                    ×{row.count}
                  </span>
                }
              />
            ))}
          </Group>
        )
      })}
      <Group label="Manual areas" count={String(manualAreas.length)}>
        {manualAreas.length === 0 && (
          <li className="review__empty">
            Drag on a page to mask anything the detector missed: logos, photos, screenshots.
          </li>
        )}
        {[...manualAreas]
          .sort((a, b) => a.page - b.page || a.id - b.id)
          .map((area) => (
            <Row
              key={area.id}
              rowKey={manualAreaKey(area.id)}
              label={`Page ${area.page + 1}`}
              onHighlight={onHighlight}
              onReveal={onReveal}
              end={
                <button
                  type="button"
                  className="review__remove"
                  onClick={() => onRemoveArea(area.id)}
                  aria-label={`Remove the area on page ${area.page + 1}`}
                >
                  Remove
                </button>
              }
            />
          ))}
      </Group>
    </aside>
  )
}

// Searched on the whole deck, ignoring case, on word limits; the term goes
// to the Custom group.
function CustomTermForm({ onAddTerm }: Pick<Props, 'onAddTerm'>) {
  const [term, setTerm] = useState('')
  const [message, setMessage] = useState<string | null>(null)

  function handleSubmit(event: FormEvent) {
    event.preventDefault()
    const problem = onAddTerm(term)
    setMessage(problem)
    if (!problem) setTerm('')
  }

  return (
    <form className="review__add" onSubmit={handleSubmit}>
      <label htmlFor="custom-term">Mask this term too</label>
      <div className="review__add-row">
        <input
          id="custom-term"
          type="text"
          value={term}
          onChange={(event) => setTerm(event.target.value)}
          autoComplete="off"
          spellCheck={false}
        />
        <button type="submit" disabled={term.trim() === ''}>
          Mask
        </button>
      </div>
      {message && <p className="review__add-message">{message}</p>}
    </form>
  )
}

type Selection = {
  keys: string[]
  unmasked: ReadonlySet<string>
  onChange: (keys: string[], masked: boolean) => void
}

// A collapsible group with its counter, and a checkbox for all its rows
// when it has a selection.
function Group({
  label,
  count,
  selection,
  children,
}: {
  label: string
  count: string
  selection?: Selection
  children: ReactNode
}) {
  const [open, setOpen] = useState(true)
  const listId = useId()

  const maskedCount = selection ? selection.keys.filter((key) => !selection.unmasked.has(key)).length : 0
  const all = selection !== undefined && maskedCount === selection.keys.length
  const mixed = selection !== undefined && maskedCount > 0 && !all

  // "Some checked" has no HTML attribute; it is set from script.
  const groupBox = useRef<HTMLInputElement>(null)
  useEffect(() => {
    if (groupBox.current) groupBox.current.indeterminate = mixed
  }, [mixed])

  return (
    <section className="review__group">
      <div className="review__group-head">
        {selection && (
          <input
            ref={groupBox}
            type="checkbox"
            checked={all}
            onChange={() => selection.onChange(selection.keys, !all)}
            aria-label={`Mask every value in ${label}`}
          />
        )}
        <button
          type="button"
          className="review__group-toggle"
          aria-expanded={open}
          aria-controls={listId}
          onClick={() => setOpen(!open)}
        >
          <span className="review__chevron" aria-hidden="true" />
          {label}
          <span className="review__count">{count}</span>
        </button>
      </div>
      <ul id={listId} hidden={!open}>
        {children}
      </ul>
    </section>
  )
}

// One row: hovering or focusing it highlights its zones on the pages, and
// its label scrolls to the first one. The checkbox keeps its own role.
function Row({
  rowKey,
  label,
  control,
  end,
  onHighlight,
  onReveal,
}: {
  rowKey: string
  label: string
  control?: ReactNode
  end: ReactNode
} & Pick<Props, 'onHighlight' | 'onReveal'>) {
  return (
    <li
      className="review__row"
      onMouseEnter={() => onHighlight(rowKey)}
      onMouseLeave={() => onHighlight(null)}
      onFocus={() => onHighlight(rowKey)}
      onBlur={() => onHighlight(null)}
    >
      {control}
      <button
        type="button"
        className="review__row-label"
        onClick={() => onReveal(rowKey)}
        title="Show on the page"
      >
        {label}
      </button>
      {end}
    </li>
  )
}
