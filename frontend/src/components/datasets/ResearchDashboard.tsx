import { ThemeIcon } from '../ThemeIcon'
import { DimensionDistribution } from './DimensionDistribution'
import { ModelPerformance, ReportActions } from './ReportPrimitives'
import { useEffect, useState } from 'react'
import { evaluationApi, type DashboardSummary, type EvaluationRun } from '../../api/client'

function percent(value: number | null | undefined) {
  return typeof value === 'number' ? `${value.toFixed(1)}%` : 'Unavailable'
}

function count(value: number | null | undefined) {
  return typeof value === 'number' ? value.toLocaleString() : '0'
}

export function ResearchDashboard({ projectId, selectedRunId, onRunChange }: { projectId: string; selectedRunId?: string; onRunChange?: (id:string)=>void }) {
  const [runs, setRuns] = useState<EvaluationRun[]>([])
  const [runId, setRunId] = useState(selectedRunId || '')
  useEffect(()=>{if(selectedRunId!==undefined)setRunId(selectedRunId)},[selectedRunId])
  const [model, setModel] = useState('')
  const [summary, setSummary] = useState<DashboardSummary | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [reload, setReload] = useState(0)
  const [included, setIncluded] = useState(true)

  useEffect(() => {
    const controller = new AbortController()
    evaluationApi.list(projectId, controller.signal)
      .then(data => { if (!controller.signal.aborted) setRuns(data) })
      .catch(() => { if (!controller.signal.aborted) setError('Unable to load dashboard runs.') })
    return () => controller.abort()
  }, [projectId, reload])

  useEffect(() => {
    const controller = new AbortController()
    const query = new URLSearchParams()
    if (runId) query.set('run_id', runId)
    if (model) query.set('model', model)
    query.set('include_ground_truth_warnings', String(included))
    setLoading(true)
    setSummary(null)
    setError('')
    evaluationApi.dashboard(projectId, query.toString(), controller.signal)
      .then(data => {
        if (!controller.signal.aborted) {
          setSummary(data)
          if (model && !data.models.some(item => item.model === model)) setModel('')
        }
      })
      .catch(() => { if (!controller.signal.aborted) setError('Unable to load dashboard summary.') })
      .finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [projectId, runId, model, reload, included])

  const models = summary?.models.map(item => item.model) || []
  const cards = [
    ['Responses Evaluated', count(summary?.total_evaluated_responses)],
    ['Benchmark Cases', count(summary?.total_unique_cases)],
    ['Models', count(summary?.total_models)],
    ['Average Overall Accuracy', percent(summary?.average_overall_accuracy)],
    ['Reliability', percent(summary?.reliability)],
    ['Hallucination Rate', percent(summary?.hallucination_rate)],
    ['Ground Truth Warnings', count(summary?.ground_truth_warning_results)],
  ]

  return <section className="overview-screen space-y-4">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="screen-heading"><h1>Research Overview Dashboard</h1><p>Comprehensive benchmark evaluation across {summary?.total_evaluated_responses.toLocaleString() ?? "?"} responses and {summary?.total_models ?? "?"} models.</p></div>
      <button className="underline" onClick={() => setReload(value => value + 1)}>Refresh dashboard</button>
    </div>
    <div className="scope-toolbar flex flex-wrap gap-2 text-sm">
      <label><input type="checkbox" checked={included} onChange={e => setIncluded(e.target.checked)}/> Include flagged ground-truth cases</label>
      <select aria-label="Dashboard run filter" value={runId} onChange={event => {setRunId(event.target.value);onRunChange?.(event.target.value)}} className="rounded border p-2">
        <option value="">All runs</option>
        {runs.map(run => <option key={run.id} value={run.id}>Run {run.id} - {run.status}</option>)}
      </select>
      <select aria-label="Dashboard model filter" value={model} onChange={event => setModel(event.target.value)} className="rounded border p-2">
        <option value="">All models</option>
        {models.map(name => <option key={name} value={name}>{name}</option>)}
      </select>
    </div>
    <ReportActions projectId={projectId} run={runs.find(r=>String(r.id)===runId)}/>
    {loading && <p role="status">Loading dashboard...</p>}
    <p className="text-sm">Ground-truth warnings: {included ? 'Included' : 'Excluded'}{summary ? `; ${summary.filtered_results ?? 0} responses / ${summary.filtered_cases ?? 0} cases filtered.` : ''}</p>
    {error && <p role="alert">{error}</p>}
    {summary && !loading && <>
      <div className="kpi-grid">
        {cards.map(([label, value]) => <div key={label} className="kpi">
          <p className="kpi-label">{label}<ThemeIcon name={label.includes("Accuracy") ? "shield" : "chart"}/></p>
          <strong>{value}</strong><small className="muted">{label.includes("Accuracy") ? "Accepted weighted score" : "Current filtered scope"}</small>
        </div>)}
      </div>
      {!summary.total_evaluated_responses && <p>No evaluated responses yet.</p>}
      <div className="benchmark-panel"><div className="panel-heading"><div><h2><ThemeIcon name="chart"/>Frontier Model Benchmark Standings</h2><p>Accepted component scores from the selected persisted research scope.</p></div><span className="version-chip">SORT: OVERALL ACCURACY DESC</span></div><ModelPerformance models={summary.models}/></div>
      <div className="overview-bottom"><DimensionDistribution projectId={projectId} runId={runId} model={model} included={included}/>
      <section className="benchmark-panel error-panel"><div className="panel-heading"><div><h2>Error Category Breakdown</h2><p>Error Summary / Multiple tags can occur on one response.</p></div></div>
        <div className="error-categories">{summary.most_common_error_tags.length ? summary.most_common_error_tags.map(item=><div className="error-category" key={item.error_tag}><span><span className="error-dot"/>{item.error_tag}: {item.count}</span><strong>{percent(summary.total_evaluated_responses ? item.count/summary.total_evaluated_responses*100:0)}</strong><small>Recorded validation tag</small><small>{item.count} occurrences</small></div>):<p className="empty-state">No error tags recorded.</p>}</div>
      </section></div>
    </>}
  </section>
}
