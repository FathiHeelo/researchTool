import {useState} from 'react'
import {reproducibilityApi,type RaterView} from '../../api/reproducibility'

export function RaterReview({projectId,runId,resultId}:{projectId:string;runId:number;resultId:number}){
  const [label,setLabel]=useState('')
  const [independent,setIndependent]=useState(true)
  const [view,setView]=useState<RaterView|null>(null)
  const [scores,setScores]=useState<Record<string,string>>({})
  const [reason,setReason]=useState('')
  const [note,setNote]=useState('')
  const [tags,setTags]=useState('')
  const [busy,setBusy]=useState(false)
  const [error,setError]=useState('')
  const [status,setStatus]=useState('')
  function load(data:RaterView){setView(data);setScores(Object.fromEntries(Object.entries(data.own_review?.new_value.scores||{}).map(([k,v])=>[k,String(v)])));setNote(data.own_review?.new_value.note||'');setTags((data.own_review?.new_value.error_tags||[]).join('\n'));setReason('')}
  async function request(save=false){
    if(busy||!label.trim())return
    setBusy(true);setError('');setStatus('')
    try{
      const data=save?await reproducibilityApi.saveRater(projectId,runId,resultId,{rater_label:label.trim(),scores:Object.fromEntries(Object.entries(scores).filter(([,v])=>v!=='').map(([k,v])=>[k,Number(v)])),reason,note,error_tags:tags.split('\n').filter(Boolean),expected_revision:view?.own_review?.revision||0})
        :await reproducibilityApi.rater(projectId,runId,resultId,label.trim(),independent)
      load(data);if(save)setStatus('Independent review saved. Accepted final decisions were not changed.')
    }catch(e){setError(e instanceof Error?e.message:'Unable to load/save rater review.')}
    finally{setBusy(false)}
  }
  return <section className="space-y-3 rounded border p-3"><h3 className="font-medium">Independent Rater Review</h3>
    <p className="text-sm">Rater labels identify independent decisions. This is a research workflow convenience, without authentication.</p>
    <label>Rater label <input aria-label="Rater label" className="border p-1" disabled={busy} value={label} onChange={e=>{setLabel(e.target.value);setView(null);setStatus('')}}/></label>
    <label className="ml-3"><input aria-label="Independent review mode" disabled={busy} type="checkbox" checked={independent} onChange={e=>{setIndependent(e.target.checked);setView(null)}}/>Independent review mode</label>
    <button disabled={busy||!label.trim()} onClick={()=>void request()}>Open rater review</button>
    {busy&&<p role="status">Loading/saving rater review…</p>}{error&&<p role="alert">{error}</p>}{status&&<p role="status">{status}</p>}
    {view&&<>{view.other_reviews_hidden&&<p>Other rater decisions are hidden until your first submission.</p>}
      <div className="overflow-x-auto"><table aria-label="Independent rater scores" className="w-full text-left text-sm"><thead><tr><th>Metric</th><th>Automated</th><th>Your explicit decision</th>{view.raters.map(r=><th key={r.rater_label}>{r.rater_label}</th>)}<th>Accepted Final</th></tr></thead><tbody>{Object.keys(view.automated_scores).map(k=>{const scale=view.metric_configuration.find(m=>m.key===k);return <tr key={k}><td>{k}</td><td>{view.automated_scores[k]??'Unavailable'}</td><td><input type="number" className="w-24 border" step="any" min={scale?.min_score??0} max={scale?.max_score??1} aria-label={`Rater score ${k}`} disabled={busy} value={scores[k]??''} onChange={e=>setScores(s=>({...s,[k]:e.target.value}))}/></td>{view.raters.map(r=><td key={r.rater_label}>{r.new_value.scores[k]??'Not reviewed'}</td>)}<td>{view.accepted_scores===null?'Hidden':view.accepted_scores[k]??'Unavailable'}</td></tr>})}</tbody></table></div>
      <p className="text-xs">Blank metrics are not rated and do not count as agreement. Existing saved decisions are retained.</p>
      <label className="block">Reason<input aria-label="Rater reason" disabled={busy} className="w-full border" value={reason} onChange={e=>setReason(e.target.value)}/></label>
      <label className="block">Note<textarea aria-label="Rater note" disabled={busy} className="w-full border" value={note} onChange={e=>setNote(e.target.value)}/></label>
      <label className="block">Error tags (one per line)<textarea aria-label="Rater error tags" disabled={busy} className="w-full border" value={tags} onChange={e=>setTags(e.target.value)}/></label>
      <button disabled={busy||!reason.trim()} onClick={()=>void request(true)}>Save independent review</button>
      <details><summary>Independent review audit history</summary><pre className="max-h-72 overflow-auto whitespace-pre-wrap text-xs">{JSON.stringify(view.audit_history,null,2)}</pre></details>
    </>}
  </section>
}
