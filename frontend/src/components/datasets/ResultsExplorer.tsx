import { ReportActions } from './ReportPrimitives'
import { useEffect, useState } from 'react'
import { evaluationApi, type EvaluationRun, type EvaluationRow, type ResultsPage } from '../../api/client'
import { ResultReview } from './ResultReview'
import { GroundTruthWarnings } from './GroundTruthWarnings'

export function ResultsExplorer({ projectId, selectedRunId, onRunChange }: { projectId: string; selectedRunId?: string; onRunChange?: (id:string)=>void }) {
  const [runs, setRuns] = useState<EvaluationRun[]>([])
  const [run, setRun] = useState(selectedRunId || '')
  useEffect(()=>{if(selectedRunId!==undefined){setRun(selectedRunId);setPage(1)}},[selectedRunId])
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
    evaluationApi.list(projectId, controller.signal).then(items => { if (!controller.signal.aborted) setRuns(items) }).catch(() => { if (!controller.signal.aborted) setError('Unable to load saved runs.') })
    return () => controller.abort()
  }, [projectId, reload])
  useEffect(() => {
    setData(null); setDetail(null); setLoading(false)
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
  if(detail) return <section className="audit-screen" aria-label="Result details"><div className="screen-heading"><button onClick={()=>setDetail(null)}>Close details / Back to Results Explorer</button><h1>Result details / {detail.case_id}</h1><p>{detail.model} / Run #{run}</p></div><details><summary>Saved source record</summary><pre>{JSON.stringify(detail.snapshot,null,2)}</pre></details><ResultReview key={detail.id} projectId={projectId} runId={Number(run)} result={detail}/></section>
  return <section className="results-screen space-y-3">
    <div className="screen-heading"><h1>Results Explorer</h1><p>Inspect, filter, and audit individual model responses against benchmark cases.</p>{data&&<span className="version-chip">Showing {data.items.length} of {data.total} matching responses ? {data.models.length} models</span>}</div>
    <button className="underline" onClick={() => setReload(value => value + 1)}>Reload saved runs</button>
    <select aria-label="Evaluation run" value={run} onChange={event => { setRun(event.target.value); onRunChange?.(event.target.value); setPage(1) }} className="m-2 rounded border p-2"><option value="">Choose a run</option>{runs.map(item => <option key={item.id} value={item.id}>Run {item.id} — {item.status}</option>)}</select>
    <ReportActions projectId={projectId} run={runs.find(r=>String(r.id)===run)}/>
    {!runs.length && !error && <p>No saved runs yet.</p>}
    {run && <div className="results-filters flex flex-wrap gap-2 text-sm">
      <select aria-label="Model filter" value={filters.model} onChange={event => change('model', event.target.value)} className="border p-2"><option value="">All models</option>{(data?.models || (filters.model ? [filters.model] : [])).map(model => <option key={model}>{model}</option>)}</select>
      {['min_score', 'max_score', 'error_tag', 'search'].map(key => <label key={key}>{key.replace('_', ' ')} <input aria-label={key} value={filters[key]} onChange={event => change(key, event.target.value)} className="w-28 border p-2" /></label>)}
      <select aria-label="Hallucination filter" value={filters.hallucination} onChange={event => change('hallucination', event.target.value)} className="border p-2"><option value="">All hallucination states</option><option value="true">Detected</option><option value="false">Not detected</option></select>
      <select aria-label="Sort results" value={filters.sort} onChange={event => change('sort', event.target.value)} className="border p-2">{['id', 'case_id', 'model', 'overall_accuracy'].map(key => <option key={key}>{key}</option>)}</select>
      <button onClick={() => change('descending', filters.descending === 'true' ? 'false' : 'true')}>Order: {filters.descending === 'true' ? 'Descending' : 'Ascending'}</button>
    </div>}
    {loading && <p role="status">Loading results…</p>}{error && <p role="alert">{error}</p>}
    {run && <GroundTruthWarnings key={run} projectId={projectId} runId={Number(run)} />}
    {data?.items.filter(item => (item as EvaluationRow & { ground_truth_warning?: boolean }).ground_truth_warning).map(item => <p key={item.id} className="text-sm text-amber-800">{item.case_id}: Ground Truth Warning</p>)}
    {data && <><div className="overflow-x-auto"><table aria-label="Evaluation results" className="w-full text-left text-sm"><thead><tr>{['Case ID', 'Model', 'Natural Language Requirement', 'Overall Accuracy', ...scoreNames, 'Hallucination', 'Errors', 'Ground Truth'].map(name => <th className="p-2" key={name}>{name}</th>)}</tr></thead><tbody>{data.items.map(item => <tr key={item.id} className="border-t"><td className="p-2"><button className="underline" onClick={() => setDetail(item)}>{item.case_id}</button></td><td><span className="model-dot"/>{item.model}</td><td className="requirement-cell">{String((item.snapshot as {case?:{requirement?:unknown}})?.case?.requirement ?? "Unavailable")}</td><td><span className="score-badge">{item.overall_accuracy == null ? "Unavailable" : `${item.overall_accuracy.toFixed(1)}%`}</span></td>{scoreNames.map(name => <td key={name}>{item.scores[name] ?? '—'}</td>)}<td>{item.hallucination_detected ? 'Yes' : 'No'}</td><td>{item.error_tags.length ? item.error_tags.map(tag=><span className="tag-badge" key={tag}>{tag}</span>):'None'}</td><td>{(item as EvaluationRow & {ground_truth_warning?:boolean}).ground_truth_warning?<span className="tag-badge">Warning</span>:'None'}</td></tr>)}</tbody></table></div>
      {!data.items.length && <p>No matching results.</p>}
      <div className="flex gap-3"><button disabled={page === 1} onClick={() => setPage(value => value - 1)}>Previous</button><span>Page {page} · {data.total} results</span><button disabled={page * 20 >= data.total} onClick={() => setPage(value => value + 1)}>Next</button></div></>}

  </section>
}
