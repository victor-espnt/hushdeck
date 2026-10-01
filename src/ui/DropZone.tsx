import { useState, type DragEvent } from 'react'

type Props = {
  onFile: (file: File) => void
  // Opens the file picker.
  onOpen: () => void
  disabled?: boolean
}

// A large target for a dropped PDF. Clicking it opens the file picker.
export default function DropZone({ onFile, onOpen, disabled }: Props) {
  const [dragging, setDragging] = useState(false)

  function handleDrop(event: DragEvent) {
    event.preventDefault()
    setDragging(false)
    const file = event.dataTransfer.files[0]
    if (file && !disabled) onFile(file)
  }

  return (
    <button
      type="button"
      className={`dropzone${dragging ? ' dropzone--active' : ''}`}
      disabled={disabled}
      onClick={onOpen}
      onDragOver={(event) => {
        event.preventDefault()
        setDragging(true)
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={handleDrop}
    >
      <span className="dropzone__title">Drop a PDF here</span>
      <span className="dropzone__note">It is read in this tab and never uploaded.</span>
    </button>
  )
}
