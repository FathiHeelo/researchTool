import type { ModelDashboardSummary, EvaluationRun } from '../../api/client'

export const percent = (v: number | null | undefined) => typeof v === 'number' && Number.isFinite(v) ? `${v.toFixed(1)}%` : 'Unavailable'
export function display(v: unknown): string {
  if (v == null) return 'Not Available'
  if (typeof v === 'number') return Number.isInteger(v) ? String(v) : v.toFixed(2)
  return typeof v === 'object' ? JSON.stringify(v) : String(v)
}
export function ReportActions({projectId, run}: {projectId: string; run?: EvaluationRun}) {
  if (!run || !['completed', 'completed_with_errors'].includes(run.status)) return null
  const url = `/projects/${encodeURIComponent(projectId)}/runs/${run.id}/report`
  return <div className="report-actions no-print"><a className="primary-action" href={url}>View Full Report</a><a href={`${url}?print=1`}>Print Report</a></div>
}
export function ModelPerformance({models}: {models: ModelDashboardSummary[]}) {
  const keys = [...new Set(models.flatMap(m => Object.keys(m.average_component_scores)))]
  return <div className="overflow-x-auto"><table aria-label="Model performance"><thead><tr>{['Rank', 'Model', 'Responses', 'Accuracy', ...keys, 'Reliability', 'Hallucination Rate'].map(k => <th key={k}>{k}</th>)}</tr></thead>
    <tbody>{[...models].sort((a,b) => (b.average_overall_accuracy ?? -Infinity) - (a.average_overall_accuracy ?? -Infinity)).map((m,i) => <tr key={m.model}><td><span className={`rank-pill ${i===0?"rank-first":""}`}>{i+1}</span></td><th scope="row">{m.model}</th><td>{m.response_count}</td><td><div className="score-with-bar"><strong>{percent(m.average_overall_accuracy)}</strong>{m.average_overall_accuracy!=null&&<span className="score-track" aria-hidden="true"><span style={{width:`${Math.max(0,Math.min(100,m.average_overall_accuracy))}%`}}/></span>}</div></td>{keys.map(k => <td key={k}>{display(m.average_component_scores[k])}</td>)}<td>{percent(m.reliability)}</td><td>{percent(m.hallucination_rate)}</td></tr>)}</tbody></table><p className="muted">Component averages use their configured score scales. Accuracy and rates are percentages.</p></div>
}
export function EvidenceTable({title, rows}: {title: string; rows: Record<string, unknown>[]}) {
  const keys = [...new Set(rows.flatMap(r => Object.keys(r)))]
  return <section className="report-section"><h2>{title}</h2>{!rows.length ? <p className="empty-state">Not Available — no data in this scope.</p> : <div className="overflow-x-auto"><table aria-label={title}><thead><tr>{keys.map(k => <th key={k}>{k.replaceAll('_',' ')}</th>)}</tr></thead><tbody>{rows.map((row,i) => <tr key={i}>{keys.map(k => <td key={k}>{display(row[k])}</td>)}</tr>)}</tbody></table></div>}</section>
}
