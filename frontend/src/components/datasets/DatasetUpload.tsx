import { useEffect, useRef, useState } from 'react'
import { uploadDataset, type DatasetMetadata } from '../../api/client'
import { UploadDropzone } from './UploadDropzone'
import { UploadStatus } from './UploadStatus'
import { SheetSelector } from './SheetSelector'
import { DatasetPreview } from './DatasetPreview'
import { ColumnMapping } from './ColumnMapping'

export function DatasetUpload() {
  const [file, setFile] = useState<File | null>(null)
  const [error, setError] = useState('')
  const [uploading, setUploading] = useState(false)
  const [result, setResult] = useState<DatasetMetadata | null>(null)
  const [selectingSheet, setSelectingSheet] = useState(false)
  const pending = useRef<AbortController | null>(null)
  useEffect(() => () => pending.current?.abort(), [])

  function reset() {
    setFile(null)
    setError('')
    setResult(null)
    setSelectingSheet(false)
  }

  function select(files: File[]) {
    if (pending.current) return
    reset()
    if (files.length !== 1) { setError('Please select one file.'); return }
    const selected = files[0]
    if (!/\.(csv|xlsx)$/i.test(selected.name)) { setError('Only .csv and .xlsx files are supported.'); return }
    setFile(selected)
  }

  async function submit() {
    if (pending.current || result) return
    if (!file) { setError('Please select a file first.'); return }
    const controller = new AbortController()
    pending.current = controller
    setUploading(true)
    setError('')
    try {
      const data = await uploadDataset(file, controller.signal)
      if (!controller.signal.aborted) setResult(data)
    } catch (reason) {
      if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : 'Upload failed. Please try again.')
    } finally {
      if (!controller.signal.aborted) setUploading(false)
      pending.current = null
    }
  }

  return (
    <section aria-label="Dataset upload" className="space-y-4 rounded-lg border border-slate-200 bg-white p-6">
      <h2 className="text-lg font-medium">Dataset upload</h2>
      <p className="text-sm text-slate-600">Upload a CSV or XLSX file to inspect its metadata. Uploads are temporary for this page.</p>
      {!result && <UploadDropzone disabled={uploading} onSelect={select} />}
      {file && !result && <p className="break-words text-sm">Selected: {file.name} ({file.size.toLocaleString()} bytes)</p>}
      <UploadStatus uploading={uploading} error={error} result={result} />
      {result?.extension.toLowerCase() === '.csv' && <DatasetPreview dataset={result} />}
      {result?.extension.toLowerCase() === '.csv' && file && result.columns && <ColumnMapping file={file} dataset={result} />}
      {result?.sheet_names && file && <SheetSelector file={file} sheetNames={result.sheet_names} onLoading={setSelectingSheet} />}
      <div className="flex gap-3">
        {!result && <button type="button" onClick={() => void submit()} disabled={uploading} className="rounded bg-slate-800 px-4 py-2 text-sm text-white disabled:opacity-50">{uploading ? 'Uploading…' : 'Upload file'}</button>}
        {(file || error || result) && <button type="button" onClick={reset} disabled={uploading || selectingSheet} className="rounded border border-slate-300 px-4 py-2 text-sm disabled:opacity-50">Change File</button>}
      </div>
    </section>
  )
}
