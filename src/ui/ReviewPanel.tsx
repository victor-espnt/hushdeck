import { useEffect, useRef } from 'react'
import type { ReviewGroup } from '../detect/review.ts'

type Props = {
  groups: ReviewGroup[]
  // Keys of the values the user chose to leave visible.
  unmasked: ReadonlySet<string>
  onChange: (keys: string[], masked: boolean) => void
}

// Checked means masked. Everything starts checked (fail closed).
export default function ReviewPanel({ groups, unmasked, onChange }: Props) {
  return (
    <aside className="review" aria-label="Review what gets masked">
      <h2>Masked in the export</h2>
      {groups.length === 0 && <p className="review__empty">Nothing detected yet.</p>}
      {groups.map((group) => (
        <ReviewGroupList key={group.type} group={group} unmasked={unmasked} onChange={onChange} />
      ))}
    </aside>
  )
}

function ReviewGroupList({ group, unmasked, onChange }: { group: ReviewGroup } & Omit<Props, 'groups'>) {
  const keys = group.values.map((value) => value.key)
  const maskedCount = keys.filter((key) => !unmasked.has(key)).length
  const all = maskedCount === keys.length
  const none = maskedCount === 0

  // "Some checked" has no HTML attribute; it is set from script.
  const groupBox = useRef<HTMLInputElement>(null)
  useEffect(() => {
    if (groupBox.current) groupBox.current.indeterminate = !all && !none
  }, [all, none])

  return (
    <section className="review__group">
      <label className="review__group-label">
        <input
          ref={groupBox}
          type="checkbox"
          checked={all}
          onChange={() => onChange(keys, !all)}
        />
        {group.label} <span className="review__count">{maskedCount}/{keys.length}</span>
      </label>
      <ul>
        {group.values.map((value) => (
          <li key={value.key}>
            <label>
              <input
                type="checkbox"
                checked={!unmasked.has(value.key)}
                onChange={(event) => onChange([value.key], event.target.checked)}
              />
              <span className="review__value">{value.value}</span>
              <span className="review__count" title={`${value.count} occurrences in the deck`}>
                ×{value.count}
              </span>
            </label>
          </li>
        ))}
      </ul>
    </section>
  )
}
