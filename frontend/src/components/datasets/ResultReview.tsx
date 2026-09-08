import { useEffect, useState } from 'react'
import { reviewApi, type EvaluationRow, type ReviewDetails } from '../../api/client'
import { RaterReview } from './RaterReview'

export function ResultReview({ projectId, runId, result }: { projectId: string; runId: number; result: EvaluationRow }) {
  const [review, setReview] = useState<ReviewDetails | null>(null)
  const [scores, setScores] = useState<Record<string, number | null>>({})
  const [reason, setReason] = useState('')
  const [note, setNote] = useState('')
  const [tags, setTags] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [saved, setSaved] = useState(false)
  function load(data: ReviewDetails) { setReview(data); setScores(data.accepted_scores); setNote(data.review_note); setTags(data.error_tags.join('\n')) }
  useEffect(() => {
    let active = true
    reviewApi.get(projectId, runId, result.id).then(data => { if (active) load(data) }).catch(() => { if (active) setError('Unable to load review details.') })
    return () => { active = false }
  }, [projectId, runId, result.id])
  async function save() {
    if (!review || busy) return
    if (Object.entries(scores).some(([key, value]) => value !== review.accepted_scores[key]) && !reason.trim()) { setError('A reason is required for score changes.'); return }
    setBusy(true); setError(''); setSaved(false)
    const changed = Object.fromEntries(Object.entries(scores).filter(([key, value]) => value !== review.accepted_scores[key]))
    try { load(await reviewApi.save(projectId, runId, result.id, { override_scores: changed, reason, review_note: note, error_tags: tags.split('\n').filter(tag => tag.trim()) })); setSaved(true) }
    catch { setError('Unable to save review. Check scores and try again.') }
    finally { setBusy(false) }
  }
  const snapshot = result.snapshot as { case?: { requirement?: unknown; expected_rule?: unknown; metadata?: unknown }; response?: { generated_output?: unknown } }
  return <section aria-label="Research review" className="review-layout">
    <div className="review-source">{[['Requirement', snapshot.case?.requirement], ['Expected Rule', snapshot.case?.expected_rule], ['Model Output', snapshot.response?.generated_output]].map(([label, value]) => <div className="source-panel" key={String(label)}><h4 className="font-medium">{String(label)}</h4><pre className="whitespace-pre-wrap text-sm">{String(value ?? '')}</pre></div>)}</div>
    <div className="review-inspector">
    {error && <p role="alert">{error}</p>}
    {!review && !error && <p>Loading review…</p>}
    {review && <>
      <h2>Evaluation Score Breakdown</h2>
      <p>Accepted Overall Accuracy: {review.accepted_overall_accuracy ?? 'Unavailable'}%</p>
      <div className="overflow-x-auto"><table aria-label="Review scores" className="w-full text-left text-sm"><thead><tr><th>Metric</th><th>Automated</th><th>Researcher Override</th><th>Accepted Final</th></tr></thead><tbody>{Object.entries(review.automated_scores).map(([key, automated]) => <tr key={key}><th>{key}</th><td>{automated ?? 'Unavailable'}</td><td><input aria-label={`Override ${key}`} type="number" min={review.metric_configuration?.find(m => m.key === key)?.min_score ?? 0} max={review.metric_configuration?.find(m => m.key === key)?.max_score ?? 1} step="any" disabled={busy} value={scores[key] ?? ''} onChange={event => setScores(previous => ({ ...previous, [key]: Number(event.target.value) }))} className="w-24 border p-1" /><span>Saved override: {review.override_scores[key] ?? 'None'}</span></td><td>{review.accepted_scores[key] ?? 'Unavailable'}</td></tr>)}</tbody></table></div>
      <h2 className="inspector-heading">Active Researcher Override</h2>
      <label className="block">Reason<input aria-label="Review reason" value={reason} onChange={event => setReason(event.target.value)} className="w-full border p-2" /></label>
      <label className="block">Researcher note<textarea aria-label="Review note" value={note} onChange={event => setNote(event.target.value)} className="w-full border p-2" /></label>
      <label className="block">Error tags (one per line)<textarea aria-label="Review error tags" value={tags} onChange={event => setTags(event.target.value)} className="w-full border p-2" /></label>
      <button disabled={busy} onClick={() => void save()} className="rounded border p-2">{busy ? 'Saving…' : 'Save review'}</button>{saved && <p role="status">Review saved</p>}
      {review.ground_truth_warning && <p className="font-medium text-amber-800">Ground Truth Warning</p>}
      <pre className="overflow-auto whitespace-pre-wrap text-xs">{JSON.stringify({ automated_errors: result.error_tags, automated_notes: result.notes, hallucinated_functions: result.hallucinated_functions, imported_metadata: snapshot.case?.metadata, ground_truth_warnings: review.ground_truth_warnings }, null, 2)}</pre>
      <h4 className="font-medium">Audit history</h4><pre className="overflow-auto whitespace-pre-wrap text-xs">{JSON.stringify(review.audit_history, null, 2)}</pre>
    </>}
    </div><div className="review-secondary"><RaterReview key={result.id} projectId={projectId} runId={runId} resultId={result.id}/></div>
  </section>
}
