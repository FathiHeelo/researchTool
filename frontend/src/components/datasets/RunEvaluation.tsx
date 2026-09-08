import { useEffect, useRef, useState } from 'react'
import { evaluationApi, type EvaluationRun, type NormalizedImport } from '../../api/client'
import { ProtocolSelector } from './ProtocolSelector'
import type { ProtocolSelection } from '../../api/experiments'

export function RunEvaluation({ projectId, imported }: { projectId: string; imported: NormalizedImport }) {
  const [run, setRun] = useState<EvaluationRun | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const pending = useRef(false)
  const [protocol, setProtocol] = useState<ProtocolSelection>({use_study_default: true})
  const [mode,setMode]=useState<'FULL'|'CHANGED_ONLY'>('FULL')
  const [baselines,setBaselines]=useState<EvaluationRun[]>([])
  const [baseline,setBaseline]=useState('')
  const [baselineBusy,setBaselineBusy]=useState(false)
  const [baselineError,setBaselineError]=useState('')
  const [baselineReload,setBaselineReload]=useState(0)
  useEffect(()=>{
    if(mode==='FULL')return
    const c=new AbortController();setBaselineBusy(true);setBaselineError('')
    evaluationApi.list(projectId,c.signal).then(data=>{if(!c.signal.aborted)setBaselines(data.filter(r=>['completed','completed_with_errors'].includes(r.status)))})
      .catch(()=>{if(!c.signal.aborted)setBaselineError('Unable to load baseline runs.')}).finally(()=>{if(!c.signal.aborted)setBaselineBusy(false)})
    return ()=>c.abort()
  },[projectId,mode,baselineReload])
  async function start() {
    if (pending.current || error || run || (mode==='CHANGED_ONLY' && !baseline)) return
    pending.current = true; setBusy(true); setError(''); setRun(null)
    try { setRun(await evaluationApi.run(projectId, imported, mode==='FULL'?protocol:{...protocol,mode,baseline_run_id:Number(baseline)})) }
    catch { setError('Unable to complete the run request. Reload saved runs before retrying; the run may have been saved.') }
    finally { pending.current = false; setBusy(false) }
  }
  return <section className="space-y-2 border-t pt-3 text-sm">
    <p>{imported.cases.length} cases · {imported.models.length} models · {imported.responses.length} responses</p>
    <ProtocolSelector projectId={projectId} disabled={busy || !!run} onChange={setProtocol}/>
    <fieldset disabled={busy||!!run}><legend>Run Mode</legend><label className="mr-3"><input type="radio" name="run-mode" checked={mode==='FULL'} onChange={()=>setMode('FULL')}/>Full Evaluation</label><label><input type="radio" name="run-mode" checked={mode==='CHANGED_ONLY'} onChange={()=>setMode('CHANGED_ONLY')}/>Re-evaluate Changed Cases Only</label></fieldset>
    {mode==='CHANGED_ONLY'&&<div><label>Baseline Run <select aria-label="Baseline Run" disabled={busy||baselineBusy||!!run} value={baseline} onChange={e=>setBaseline(e.target.value)}><option value="">Choose completed baseline</option>{baselines.map(r=><option key={r.id} value={r.id}>Run {r.id} — {r.status}</option>)}</select></label><button disabled={busy||baselineBusy||!!run} onClick={()=>setBaselineReload(n=>n+1)}>Reload baselines</button>{baselineBusy&&<p role="status">Loading baseline runs…</p>}{baselineError&&<p role="alert">{baselineError}</p>}{!baselineBusy&&!baselineError&&!baselines.length&&<p>No completed baseline runs available. Full Evaluation remains available.</p>}</div>}
    <button onClick={() => void start()} disabled={busy || !!run || !!error || (mode==='CHANGED_ONLY'&&(!baseline||baselineBusy))} className="rounded bg-slate-800 px-4 py-2 text-white disabled:opacity-50">Run Evaluation</button>
    {busy && <p role="status">Running evaluation — awaiting processed count from server ({imported.responses.length} total).</p>}
    {error && <p role="alert">{error}</p>}
    {run && <div role="status"><p>Run {run.id}: {run.status} · {run.processed_responses}/{run.total_responses} processed</p>
      <p>Total evaluated: {run.summary.total_evaluated} · Successful evaluations: {run.summary.successful_evaluations}</p>
      <p>Execution failures: {run.summary.execution_failures} · Hallucinations: {run.summary.hallucinations}</p>
      <p>Average overall accuracy: {run.summary.average_overall_accuracy ?? 'Unavailable'}</p>
      <p>Reused: {run.summary.reused_count??0} · Re-evaluated: {run.summary.reevaluated_count??run.processed_responses} · Failed: {run.summary.failed_count??0}</p>
      {run.failure_summary && <p>{run.failure_summary}</p>}<p>Reload saved runs below to explore results.</p></div>}
  </section>
}
