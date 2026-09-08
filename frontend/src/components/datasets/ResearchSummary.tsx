import { useEffect, useState } from 'react'
import { analystSections, researchApi, type AnalystSummary } from '../../api/research'

export function summaryText(data: AnalystSummary): string {
  return ['Research Summary', `Scope: ${JSON.stringify(data.scope)}`,
    ...Object.entries(analystSections).flatMap(([key, label]) => [label,
      ...data[key as keyof typeof analystSections].map(f => `${f.text} [${f.supporting_metric}; evidence count=${f.evidence_count}]`)])].join('\n\n')
}

export function ResearchSummary({projectId, query}: {projectId: string; query: string}) {
  const [loaded, setLoaded] = useState<{query: string; data: AnalystSummary} | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(true)
  const [retry, setRetry] = useState(0)
  const [copyStatus, setCopyStatus] = useState('')
  const [copyError, setCopyError] = useState('')
  useEffect(() => {
    const controller = new AbortController()
    setLoaded(null); setError(''); setBusy(true); setCopyStatus(''); setCopyError('')
    researchApi.analyst(projectId, query, controller.signal)
      .then(data => {if (!controller.signal.aborted) setLoaded({query, data})})
      .catch(() => {if (!controller.signal.aborted) setError('Unable to load research summary. Please retry.')})
      .finally(() => {if (!controller.signal.aborted) setBusy(false)})
    return () => controller.abort()
  }, [projectId, query, retry])
  async function copy(text: string) {
    setCopyStatus(''); setCopyError('')
    try {await navigator.clipboard.writeText(text); setCopyStatus('Copied to clipboard.')}
    catch {setCopyError('Clipboard unavailable. You can select and copy the summary text manually.')}
  }
  const data = loaded?.query === query && !busy ? loaded.data : null
  return <section aria-label="Research Summary" className="space-y-4">
    <h3 className="text-lg font-medium">Research Summary</h3>
    <p className="text-sm">Deterministic observations from accepted-score analytics in the current dashboard scope.</p>
    {busy && <p role="status">Loading research summary…</p>}
    {error && <div role="alert">{error} <button onClick={() => setRetry(n => n+1)}>Retry summary</button></div>}
    {copyStatus && <p role="status">{copyStatus}</p>}{copyError && <p role="alert">{copyError}</p>}
    {data && <><button className="underline" onClick={() => void copy(summaryText(data))}>Copy Research Summary</button>
      {Object.entries(analystSections).map(([key, label]) => <details key={key} open={key === 'overview' || key === 'limitations'} className="rounded border p-3">
        <summary className="font-medium">{label}</summary>
        {data[key as keyof typeof analystSections].length ? <ul className="space-y-3 pt-3">{data[key as keyof typeof analystSections].map((finding, i) => <li key={i} className="break-words text-sm">
          <h4 className="font-medium">{finding.title}</h4><p>{finding.text}</p>
          <p className="text-xs text-slate-500">Source: {finding.supporting_metric} · Evidence count: {finding.evidence_count}</p>
          <button aria-label={`Copy finding ${key} ${i+1}`} className="text-xs underline" onClick={() => void copy(`${finding.text} [${finding.supporting_metric}; evidence count=${finding.evidence_count}]`)}>Copy finding</button>
        </li>)}</ul> : <p className="pt-2 text-sm">Not Available: no findings in this scope.</p>}
      </details>)}</>}
  </section>
}
