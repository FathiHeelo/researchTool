import { useRef } from 'react'

export function UploadDropzone({ disabled, onSelect }: { disabled: boolean; onSelect: (files: File[]) => void }) {
  const input = useRef<HTMLInputElement>(null)
  return (
    <div onDragOver={event => event.preventDefault()} onDrop={event => {
      event.preventDefault()
      if (!disabled) onSelect(Array.from(event.dataTransfer.files))
    }} className="rounded-lg border-2 border-dashed border-slate-300 p-6 text-center">
      <p className="mb-3 text-sm text-slate-600">Drop one CSV or XLSX file here, or choose a file.</p>
      <input ref={input} type="file" accept=".csv,.xlsx" aria-label="Dataset file" className="sr-only" disabled={disabled}
        onChange={event => {
          onSelect(Array.from(event.target.files || []))
          event.target.value = ''
        }} />
      <button type="button" disabled={disabled} onClick={() => input.current?.click()} className="rounded border border-slate-300 px-4 py-2 text-sm disabled:opacity-50">Choose file</button>
    </div>
  )
}
