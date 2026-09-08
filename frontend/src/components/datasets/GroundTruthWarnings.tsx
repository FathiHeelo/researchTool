import { useState } from 'react'
import { reviewApi, type GroundTruthWarning, type ReviewDetails } from '../../api/client'

export function GroundTruthWarnings({ projectId, runId }: { projectId: string; runId: number }) {
  const [items, setItems] = useState<GroundTruthWarning[] | null>(null)
  const [type, setType] = useState('')
  const [search, setSearch] = useState('')
  const [severity, setSeverity] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [detail, setDetail] = useState<ReviewDetails | null>(null)
  async function inspect(id: number) {
    if (busy) return
    setBusy(true); setError(''); setDetail(null)
    try { setDetail(await reviewApi.get(projectId, runId, id)) }
    catch { setError('Unable to load model result. Please retry.') } finally { setBusy(false) }
  }
  async function load() { setBusy(true); setError(''); try { setItems(await reviewApi.warnings(projectId, runId)) } catch { setError('Unable to load ground-truth warnings.') } finally { setBusy(false) } }
  return <section className="space-y-2"><button disabled={busy} onClick={() => void load()}>Ground Truth Warnings</button>{busy && <p>Loading warnings…</p>}{error && <p role="alert">{error}</p>}{items && <>
    <select aria-label="Warning type" value={type} onChange={event => setType(event.target.value)}><option value="">All warning types</option>{[...new Set(items.map(item => item.warning_type))].map(value => <option key={value}>{value}</option>)}</select>
    <select aria-label="Warning severity" value={severity} onChange={event => setSeverity(event.target.value)}><option value="">All severities</option>{[...new Set(items.map(item => item.severity))].map(value => <option key={value}>{value}</option>)}</select>
    <input aria-label="Warning case search" placeholder="Case ID / search" className="border p-1" value={search} onChange={e => setSearch(e.target.value)}/>
    {!items.length && <p>No ground-truth warnings.</p>}
    <ul>{items.filter(item => (!type || item.warning_type === type) && (!severity || item.severity === severity) && `${item.case_id} ${item.message}`.toLowerCase().includes(search.toLowerCase())).map((item, index) => <li key={index} className="border-t p-2 text-sm">{item.case_id} · {item.warning_type} · {item.severity}<p>{item.message}</p><pre className="whitespace-pre-wrap break-words">{item.expected_rule}</pre><details><summary>Case context and related model results</summary><p>{item.requirement}</p><ul>{items.filter(other => other.case_id === item.case_id).map((other, i) => <li key={i}>Result {other.result_id}: {other.model} — {other.warning_type}: {other.message}</li>)}</ul></details></li>)}</ul>
    <div className="flex flex-wrap gap-3">{[...new Map(items.filter(item => item.result_id && (!search || `${item.case_id}`.toLowerCase().includes(search.toLowerCase()))).map(item => [item.result_id, item])).values()].map(item => <button disabled={busy} className="underline" key={item.result_id} onClick={() => item.result_id && void inspect(item.result_id)}>Open {item.case_id} / {item.model} result</button>)}</div>
    {detail && <section><h3>Model result — {detail.case_id} / {detail.model}</h3><pre className="max-h-96 overflow-auto whitespace-pre-wrap break-words text-xs">{JSON.stringify({source: detail.snapshot, warnings: detail.ground_truth_warnings, automated: detail.automated_scores, overrides: detail.override_scores, accepted: detail.accepted_scores}, null, 2)}</pre><button onClick={() => setDetail(null)}>Close model result</button></section>}
  </>}</section>
}
