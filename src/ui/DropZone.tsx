import { useRef, useState, type DragEvent } from 'react'

type Props = {
  onFile: (file: File) => void
  onSample: () => void
  disabled?: boolean
}

export default function DropZone({ onFile, onSample, disabled }: Props) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)

  function handleDrop(event: DragEvent) {
    event.preventDefault()
    setDragging(false)
    const file = event.dataTransfer.files[0]
    if (file && !disabled) onFile(file)
  }

  return (
    <div
      className={`dropzone${dragging ? ' dropzone--active' : ''}`}
      onDragOver={(event) => {
        event.preventDefault()
        setDragging(true)
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={handleDrop}
    >
      <p>Drop a PDF here</p>
      <button
        type="button"
        disabled={disabled}
        onClick={() => inputRef.current?.click()}
      >
        Choose a file
      </button>
      <button type="button" className="dropzone__sample" disabled={disabled} onClick={onSample}>
        Try with a sample deck
      </button>
      <input
        ref={inputRef}
        type="file"
        accept="application/pdf,.pdf"
        hidden
        onChange={(event) => {
          const file = event.target.files?.[0]
          if (file) onFile(file)
          // Allow picking the same file again.
          event.target.value = ''
        }}
      />
    </div>
  )
}
