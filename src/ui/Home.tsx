import DropZone from './DropZone.tsx'
import Logo from './Logo.tsx'

const VERIFY_URL = 'https://github.com/victor-espnt/hushdeck#check-it-yourself'

type Props = {
  onFile: (file: File) => void
  onSample: () => void
  onOpenPicker: () => void
  // While a file is opening.
  status: string | null
  error: string | null
}

// The screen before any deck is loaded.
export default function Home({ onFile, onSample, onOpenPicker, status, error }: Props) {
  const busy = status !== null
  return (
    <main className="home">
      <h1 className="home__logo">
        <Logo size="large" />
      </h1>
      <p className="home__tagline">Anonymize a pitch deck in your browser. Nothing leaves your device.</p>
      <DropZone onFile={onFile} onOpen={onOpenPicker} disabled={busy} />
      {status && (
        <p role="status" className="home__status">
          {status}
        </p>
      )}
      {error && (
        <p role="alert" className="home__error">
          {error}
        </p>
      )}
      <div className="home__actions">
        <button type="button" className="button button--primary" onClick={onSample} disabled={busy}>
          Try with a sample deck
        </button>
        <button type="button" className="link-button" onClick={onOpenPicker} disabled={busy}>
          or choose a PDF
        </button>
      </div>
      <ul className="home__points">
        <li>Runs in your browser</li>
        <li>No upload, no tracking</li>
        <li>
          <a href={VERIFY_URL}>Verify it yourself →</a>
        </li>
      </ul>
    </main>
  )
}
