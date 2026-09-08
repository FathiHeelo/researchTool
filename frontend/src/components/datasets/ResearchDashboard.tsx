import { useEffect, useState } from 'react'
import { evaluationApi, type DashboardSummary, type EvaluationRun } from '../../api/client'

function percent(value: number | null | undefined) {
  return typeof value === 'number' ? `${value.toFixed(1)}%` : 'Unavailable'
}

function count(value: number | null | undefined) {
  return typeof value === 'number' ? value.toLocaleString() : '0'
}

export function ResearchDashboard({ projectId }: { projectId: string }) {
  const [runs, setRuns] = useState<EvaluationRun[]>([])
  const [runId, setRunId] = useState('')
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
    ['Models', count(summary?.total_models)],
    ['Average Overall Accuracy', percent(summary?.average_overall_accuracy)],
    ['Reliability', percent(summary?.reliability)],
    ['Hallucination Rate', percent(summary?.hallucination_rate)],
    ['Ground Truth Warnings', count(summary?.ground_truth_warning_results)],
  ]

  return <section className="space-y-4 rounded border bg-white p-5">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <h2 className="text-lg font-medium">Research Dashboard</h2>
      <button className="underline" onClick={() => setReload(value => value + 1)}>Refresh dashboard</button>
    </div>
    <div className="flex flex-wrap gap-2 text-sm">
      <label><input type="checkbox" checked={included} onChange={e => setIncluded(e.target.checked)}/> Include flagged ground-truth cases</label>
      <select aria-label="Dashboard run filter" value={runId} onChange={event => setRunId(event.target.value)} className="rounded border p-2">
        <option value="">All runs</option>
        {runs.map(run => <option key={run.id} value={run.id}>Run {run.id} - {run.status}</option>)}
      </select>
      <select aria-label="Dashboard model filter" value={model} onChange={event => setModel(event.target.value)} className="rounded border p-2">
        <option value="">All models</option>
        {models.map(name => <option key={name} value={name}>{name}</option>)}
      </select>
    </div>
    {loading && <p role="status">Loading dashboard...</p>}
    <p className="text-sm">Ground-truth warnings: {included ? 'Included' : 'Excluded'}{summary ? `; ${summary.filtered_results ?? 0} responses / ${summary.filtered_cases ?? 0} cases filtered.` : ''}</p>
    {error && <p role="alert">{error}</p>}
    {summary && !loading && <>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {cards.map(([label, value]) => <div key={label} className="rounded border border-slate-200 p-3">
          <p className="text-xs uppercase tracking-wide text-slate-500">{label}</p>
          <p className="mt-1 text-xl font-semibold">{value}</p>
        </div>)}
      </div>
      {!summary.total_evaluated_responses && <p>No evaluated responses yet.</p>}
      <div className="overflow-x-auto">
        <table aria-label="Model performance" className="w-full text-left text-sm">
          <thead><tr>{['Model', 'Responses', 'Accuracy', 'Reliability', 'Hallucination Rate'].map(label => <th className="p-2" key={label}>{label}</th>)}</tr></thead>
          <tbody>{summary.models.map(item => <tr className="border-t" key={item.model}>
            <td className="p-2">{item.model}</td>
            <td className="p-2">{item.response_count}</td>
            <td className="p-2">{percent(item.average_overall_accuracy)}</td>
            <td className="p-2">{percent(item.reliability)}</td>
            <td className="p-2">{percent(item.hallucination_rate)}</td>
          </tr>)}</tbody>
        </table>
      </div>
      <div>
        <h3 className="font-medium">Error Summary</h3>
        {summary.most_common_error_tags.length ? <ul className="mt-2 space-y-1 text-sm">
          {summary.most_common_error_tags.map(item => <li key={item.error_tag}>{item.error_tag}: {item.count}</li>)}
        </ul> : <p className="mt-2 text-sm">No error tags recorded.</p>}
      </div>
    </>}
  </section>
}
