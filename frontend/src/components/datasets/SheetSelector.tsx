import { useEffect, useRef, useState } from 'react'
import { uploadDataset, type DatasetMetadata } from '../../api/client'
import { DatasetPreview } from './DatasetPreview'
import { ColumnMapping } from './ColumnMapping'

export function SheetSelector({ file, sheetNames, onLoading }: { file: File; sheetNames: string[]; onLoading: (loading: boolean) => void }) {
  const [choice, setChoice] = useState('')
  const [result, setResult] = useState<DatasetMetadata | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const pending = useRef<AbortController | null>(null)
  useEffect(() => () => pending.current?.abort(), [])

  async function select(name: string) {
    if (pending.current) return
    setChoice(name)
    setResult(null)
    setError('')
    if (!name) return
    const controller = new AbortController()
    pending.current = controller
    setLoading(true)
    onLoading(true)
    try {
      const metadata = await uploadDataset(file, controller.signal, name)
      if (!controller.signal.aborted) setResult(metadata)
    } catch (reason) {
      if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : 'Unable to load worksheet. Please try again.')
    } finally {
      pending.current = null
      if (!controller.signal.aborted) { setLoading(false); onLoading(false) }
    }
  }

  return (
    <div className="space-y-3 border-t border-slate-200 pt-4">
      <label htmlFor="worksheet" className="block text-sm font-medium">Worksheet</label>
      <select id="worksheet" value={choice} disabled={loading} onChange={event => void select(event.target.value)} className="w-full rounded border border-slate-300 p-2 disabled:opacity-50">
        <option value="">Choose a worksheet</option>
        {sheetNames.map(name => <option key={name} value={name}>{name}</option>)}
      </select>
      <div aria-live="polite">
        {loading ? <p role="status">Loading selected sheet…</p> : error ? <div><p role="alert" className="text-red-700">{error}</p><button type="button" onClick={() => void select(choice)} className="mt-2 text-sm underline">Retry sheet</button></div> : result ? (
          <div className="space-y-2 text-sm">
            <p role="status">Sheet selected successfully</p>
            <p className="whitespace-pre-wrap break-words">Selected sheet: {result.selected_sheet}</p>
            <p>Data rows: {result.total_row_count}</p>
            <p>Columns: {result.column_count}</p>
            {result.columns?.length ? <div className="overflow-x-auto">
              <table aria-label="Column metadata" className="w-full border-collapse text-left">
                <thead><tr className="border-b border-slate-200"><th scope="col" className="px-3 py-2 font-medium">Column</th><th scope="col" className="px-3 py-2 font-medium">Inferred Type</th></tr></thead>
                <tbody>{result.columns.map((column, index) => <tr key={index} className="border-b border-slate-100">
                  <th scope="row" className="whitespace-pre-wrap break-words px-3 py-2 font-normal">{column === null || column === '' ? '(blank header)' : String(column)}</th>
                  <td className="px-3 py-2">{Array.isArray(result.inferred_data_types) ? result.inferred_data_types[index] : null}</td>
                </tr>)}</tbody>
              </table>
            </div> : <p>No columns in this worksheet.</p>}
            <DatasetPreview dataset={result} />
            <ColumnMapping key={result.selected_sheet} file={file} dataset={result} />
          </div>
        ) : <p role="status">Awaiting worksheet selection</p>}
      </div>
    </div>
  )
}
