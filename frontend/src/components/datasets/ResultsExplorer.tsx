import { useEffect, useState } from 'react'
import { evaluationApi, type EvaluationRun, type EvaluationRow, type ResultsPage } from '../../api/client'
import { ResultReview } from './ResultReview'
import { GroundTruthWarnings } from './GroundTruthWarnings'

export function ResultsExplorer({ projectId }: { projectId: string }) {
  const [runs, setRuns] = useState<EvaluationRun[]>([])
  const [run, setRun] = useState('')
  const [reload, setReload] = useState(0)
  const [data, setData] = useState<ResultsPage | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [page, setPage] = useState(1)
  const [filters, setFilters] = useState<Record<string, string>>({ model: '', min_score: '', max_score: '', error_tag: '', hallucination: '', search: '', sort: 'id', descending: 'false' })
  const [detail, setDetail] = useState<EvaluationRow | null>(null)
  useEffect(() => {
    const controller = new AbortController()
    setError('')
    evaluationApi.list(projectId, controller.signal).then(setRuns).catch(() => { if (!controller.signal.aborted) setError('Unable to load saved runs.') })
    return () => controller.abort()
  }, [projectId, reload])
  useEffect(() => {
    setData(null); setDetail(null)
    if (!run) return
    const controller = new AbortController()
    setLoading(true); setError('')
    const query = new URLSearchParams({ page: String(page), page_size: '20' })
    Object.entries(filters).forEach(([key, value]) => { if (value !== '') query.set(key, value) })
    evaluationApi.results(projectId, Number(run), query.toString(), controller.signal)
      .then(result => { if (!controller.signal.aborted) setData(result) })
      .catch(() => { if (!controller.signal.aborted) setError('Unable to load results. Check filters and retry.') })
      .finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [projectId, run, filters, page, reload])
  const change = (key: string, value: string) => { setPage(1); setFilters(previous => ({ ...previous, [key]: value })) }
  const scoreNames = [...new Set(data?.items.flatMap(item => Object.keys(item.scores)) || [])]
  return <section className="space-y-3 rounded border bg-white p-5">
    <h2 className="text-lg font-medium">Results Explorer</h2>
    <button className="underline" onClick={() => setReload(value => value + 1)}>Reload saved runs</button>
    <select aria-label="Evaluation run" value={run} onChange={event => { setRun(event.target.value); setPage(1) }} className="m-2 rounded border p-2"><option value="">Choose a run</option>{runs.map(item => <option key={item.id} value={item.id}>Run {item.id} — {item.status}</option>)}</select>
    {!runs.length && !error && <p>No saved runs yet.</p>}
    {run && <div className="flex flex-wrap gap-2 text-sm">
      <select aria-label="Model filter" value={filters.model} onChange={event => change('model', event.target.value)} className="border p-2"><option value="">All models</option>{(data?.models || (filters.model ? [filters.model] : [])).map(model => <option key={model}>{model}</option>)}</select>
      {['min_score', 'max_score', 'error_tag', 'search'].map(key => <label key={key}>{key.replace('_', ' ')} <input aria-label={key} value={filters[key]} onChange={event => change(key, event.target.value)} className="w-28 border p-2" /></label>)}
      <select aria-label="Hallucination filter" value={filters.hallucination} onChange={event => change('hallucination', event.target.value)} className="border p-2"><option value="">All hallucination states</option><option value="true">Detected</option><option value="false">Not detected</option></select>
      <select aria-label="Sort results" value={filters.sort} onChange={event => change('sort', event.target.value)} className="border p-2">{['id', 'case_id', 'model', 'overall_accuracy'].map(key => <option key={key}>{key}</option>)}</select>
      <button onClick={() => change('descending', filters.descending === 'true' ? 'false' : 'true')}>Order: {filters.descending === 'true' ? 'Descending' : 'Ascending'}</button>
    </div>}
    {loading && <p role="status">Loading results…</p>}{error && <p role="alert">{error}</p>}
    {run && <GroundTruthWarnings key={run} projectId={projectId} runId={Number(run)} />}
    {data?.items.filter(item => (item as EvaluationRow & { ground_truth_warning?: boolean }).ground_truth_warning).map(item => <p key={item.id} className="text-sm text-amber-800">{item.case_id}: Ground Truth Warning</p>)}
    {data && <><div className="overflow-x-auto"><table aria-label="Evaluation results" className="w-full text-left text-sm"><thead><tr>{['Case ID', 'Model', 'Overall Accuracy', ...scoreNames, 'Hallucination', 'Errors'].map(name => <th className="p-2" key={name}>{name}</th>)}</tr></thead><tbody>{data.items.map(item => <tr key={item.id} className="border-t"><td className="p-2"><button className="underline" onClick={() => setDetail(item)}>{item.case_id}</button></td><td>{item.model}</td><td>{item.overall_accuracy ?? 'Unavailable'}</td>{scoreNames.map(name => <td key={name}>{item.scores[name] ?? '—'}</td>)}<td>{item.hallucination_detected ? 'Yes' : 'No'}</td><td>{item.error_tags.join(', ')}</td></tr>)}</tbody></table></div>
      {!data.items.length && <p>No matching results.</p>}
      <div className="flex gap-3"><button disabled={page === 1} onClick={() => setPage(value => value - 1)}>Previous</button><span>Page {page} · {data.total} results</span><button disabled={page * 20 >= data.total} onClick={() => setPage(value => value + 1)}>Next</button></div></>}
    {detail && <section aria-label="Result details"><h3 className="font-medium">Result details</h3><button onClick={() => setDetail(null)}>Close details</button><pre className="max-h-96 overflow-auto whitespace-pre-wrap text-xs">{JSON.stringify({ snapshot: detail.snapshot, scores: detail.scores, hallucinated_functions: detail.hallucinated_functions, errors: detail.error_tags, notes: detail.notes }, null, 2)}</pre><ResultReview key={detail.id} projectId={projectId} runId={Number(run)} result={detail} /></section>}
  </section>
}
