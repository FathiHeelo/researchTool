import { useEffect, useRef, useState } from 'react'
import { importDataset, type ColumnAssignment, type DatasetMetadata, type NormalizedImport } from '../../api/client'
import { useParams } from 'react-router-dom'
import { RunEvaluation } from './RunEvaluation'

export function ColumnMapping({ file, dataset }: { file: File; dataset: DatasetMetadata }) {
  const columns = dataset.columns || []
  const { projectId } = useParams()
  const [open, setOpen] = useState(false)
  const [assignments, setAssignments] = useState<ColumnAssignment[]>(columns.map((column, index) => ({ index, role: 'metadata', label: column === null ? '' : String(column) })))
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<NormalizedImport | null>(null)
  const [importRevision, setImportRevision] = useState(0)
  const pending = useRef<AbortController | null>(null)
  useEffect(() => () => pending.current?.abort(), [])
  const problems = []
  if (assignments.filter(item => item.role === 'requirement').length !== 1) problems.push('Map exactly one Requirement column.')
  if (assignments.filter(item => item.role === 'expected_rule').length !== 1) problems.push('Map exactly one Expected Rule column.')
  if (assignments.filter(item => item.role === 'case_id').length > 1) problems.push('Map at most one Case ID column.')
  if (!assignments.some(item => item.role === 'model')) problems.push('Select at least one Model Output column.')
  function change(index: number, patch: Partial<ColumnAssignment>) {
    setAssignments(items => items.map(item => item.index === index ? { ...item, ...patch } : item))
    setResult(null); setError('')
  }
  async function submit() {
    if (pending.current || problems.length) return
    const controller = new AbortController()
    pending.current = controller; setBusy(true); setError('')
    try {
      const normalized = await importDataset(file, assignments, controller.signal, dataset.selected_sheet)
      if (!controller.signal.aborted) { setResult(normalized); setImportRevision(value => value + 1) }
    } catch (reason) {
      if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : 'Unable to import dataset.')
    } finally { pending.current = null; if (!controller.signal.aborted) setBusy(false) }
  }
  if (!open) return <button type="button" onClick={() => setOpen(true)} className="rounded border px-4 py-2">Configure Columns</button>
  return <section className="space-y-3 border-t border-slate-200 pt-4">
    <h3 className="font-medium">Configure Columns</h3>
    <p className="text-sm text-slate-600">Map core fields and model outputs. Other columns remain research metadata unless ignored. Metadata labels are editable.</p>
    {assignments.map(item => <div key={item.index} className="flex flex-wrap items-center gap-3 text-sm">
      <span className="whitespace-pre-wrap">{item.index + 1}. {columns[item.index] === null || columns[item.index] === '' ? '(blank header)' : String(columns[item.index])}</span>
      <select aria-label={`Role for column ${item.index + 1}`} value={item.role} disabled={busy} onChange={event => change(item.index, { role: event.target.value })} className="rounded border p-2">
        <optgroup label="Core Fields"><option value="case_id">Case ID (optional)</option><option value="requirement">Requirement</option><option value="expected_rule">Expected Rule</option></optgroup>
        <optgroup label="Model Outputs"><option value="model">Model Output</option></optgroup>
        <optgroup label="Research / Additional Metadata"><option value="metadata">Metadata</option><option value="ignored">Ignored</option></optgroup>
      </select>
      {['model', 'metadata'].includes(item.role) && <input aria-label={`Label for column ${item.index + 1}`} value={item.label || ''} disabled={busy} onChange={event => change(item.index, { label: event.target.value })} className="rounded border p-2" />}
    </div>)}
    {problems.length > 0 && <ul className="text-sm text-slate-600">{problems.map(problem => <li key={problem}>{problem}</li>)}</ul>}
    <button type="button" disabled={busy || problems.length > 0} onClick={() => void submit()} className="rounded bg-slate-800 px-4 py-2 text-white disabled:opacity-50">{busy ? 'Importing…' : 'Validate Mapping and Import'}</button>
    {error && <p role="alert">{error}</p>}
    {result && <p role="status">Imported {result.cases.length} cases, {result.models.length} models, and {result.responses.length} responses for this page. Not saved to the database.</p>}
    {result && projectId && <RunEvaluation key={importRevision} projectId={projectId} imported={result} />}
  </section>
}
