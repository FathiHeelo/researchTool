import { useEffect, useState } from 'react'
import { researchApi, type MetricConfiguration } from '../../api/research'

export function MetricsSettings({projectId}: {projectId: string}) {
  const [metrics, setMetrics] = useState<MetricConfiguration[]>([])
  const [busy, setBusy] = useState(true)
  const [error, setError] = useState('')
  const [status, setStatus] = useState('')
  useEffect(() => {
    const controller = new AbortController()
    researchApi.metrics(projectId, controller.signal).then(data => { if (!controller.signal.aborted) setMetrics(data.metrics) })
      .catch(() => { if (!controller.signal.aborted) setError('Unable to load metrics. Retry loading below.') })
      .finally(() => { if (!controller.signal.aborted) setBusy(false) })
    return () => controller.abort()
  }, [projectId])
  async function save(reset = false, reload = false) {
    if (busy) return
    setBusy(true); setError(''); setStatus('')
    try {
      const data = reload ? await researchApi.metrics(projectId) : reset ? await researchApi.resetMetrics(projectId) : await researchApi.saveMetrics(projectId, metrics)
      setMetrics(data.metrics); setStatus(reload ? 'Metrics loaded.' : 'Saved. Future evaluations will use this configuration.')
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Unable to save metrics.') }
    finally { setBusy(false) }
  }
  function update(index: number, change: Partial<MetricConfiguration>) {
    setStatus(''); setMetrics(values => values.map((value, i) => i === index ? {...value, ...change} : value))
  }
  return <section className="space-y-3 rounded border bg-white p-5">
    <h2 className="text-lg font-medium">Metrics Settings</h2>
    <p className="text-sm">Changes affect future evaluations only. Historical runs retain their own configuration. Positive enabled weights are normalized automatically.</p>
    {busy && <p role="status">Loading/saving metrics…</p>}{error && <p role="alert">{error}</p>}{status && <p role="status">{status}</p>}
    <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr><th>Metric</th><th>Enabled</th><th>Weight</th><th>Score Scale</th><th>Mode</th></tr></thead><tbody>
      {metrics.map((m, i) => <tr key={m.key}><td className="p-2">{m.name}<p className="text-xs">{m.description}</p></td>
        <td><input aria-label={`Enable ${m.key}`} type="checkbox" disabled={busy} checked={m.enabled} onChange={e => update(i, {enabled: e.target.checked})}/></td>
        <td><input aria-label={`Weight ${m.key}`} className="w-24 border p-1" disabled={busy} type="number" min="0" step="any" value={m.weight} onChange={e => update(i, {weight: Number(e.target.value)})}/></td>
        <td>{m.min_score} – {m.max_score} ({m.score_type}){m.allowed_values && `: ${m.allowed_values.join(', ')}`}</td><td>{m.evaluation_mode}</td></tr>)}
    </tbody></table></div>
    <div className="flex gap-4"><button disabled={busy || !metrics.length} onClick={() => void save()}>Save configuration</button><button disabled={busy} onClick={() => void save(true)}>Reset defaults</button><button disabled={busy} onClick={() => void save(false, true)}>Reload metrics</button></div>
  </section>
}
