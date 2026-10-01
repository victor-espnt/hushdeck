// "Hush" followed by a black bar the width of "deck", which reveals the
// word on hover and focus. Links back to the home screen.
export default function Logo({ size }: { size: 'large' | 'small' }) {
  return (
    <a className={`logo logo--${size}`} href={import.meta.env.BASE_URL} aria-label="Hushdeck, home">
      <span aria-hidden="true">Hush</span>
      <span className="logo__deck" aria-hidden="true">
        deck
      </span>
    </a>
  )
}
