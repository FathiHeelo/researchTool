import {useEffect,useState} from 'react'
import {reproducibilityApi,type RaterAgreement} from '../../api/reproducibility'
import type {ResearchRecord} from '../../api/research'

export function InterRaterReview({projectId,run}:{projectId:string;run:string}){
  const [a,setA]=useState(''),[b,setB]=useState(''),[metric,setMetric]=useState('')
  const [data,setData]=useState<RaterAgreement|null>(null),[detail,setDetail]=useState<ResearchRecord|null>(null)
  const [busy,setBusy]=useState(false),[error,setError]=useState(''),[reload,setReload]=useState(0)
  useEffect(()=>{
    const c=new AbortController();setData(null);setDetail(null);setError('')
    if(!run)return ()=>c.abort()
    setBusy(true)
    const q=new URLSearchParams({rater_a:a,rater_b:b});if(metric)q.set('metric',metric)
    reproducibilityApi.agreement(projectId,run,q.toString(),c.signal).then(d=>{if(!c.signal.aborted)setData(d)})
      .catch(()=>{if(!c.signal.aborted)setError('Unable to load inter-rater agreement. Choose distinct raters and retry.')})
      .finally(()=>{if(!c.signal.aborted)setBusy(false)})
    return ()=>c.abort()
  },[projectId,run,a,b,metric,reload])
  return <section className="space-y-3"><h3 className="font-medium">Inter-Rater Review</h3>
    <p>Select a run above. Independent submissions are made in result details; this comparison view shows both raters.</p>
    {!run&&<p>Choose a run to compare raters.</p>}
    <div className="flex flex-wrap gap-3">{([['Rater A',a,setA],['Rater B',b,setB]] as const).map(([label,value,setter])=><label key={label}>{label}<select aria-label={label} value={value} onChange={e=>setter(e.target.value)}><option value="">Choose rater</option>{[...new Set([...(data?.raters||[]),a,b].filter(Boolean))].map(r=><option key={r}>{r}</option>)}</select></label>)}
      <label>Metric (optional)<input aria-label="Inter-rater metric" className="border" value={metric} onChange={e=>setMetric(e.target.value)}/></label><button onClick={()=>setReload(n=>n+1)}>Refresh rater agreement</button></div>
    {busy&&<p role="status">Loading inter-rater agreement…</p>}{error&&<p role="alert">{error}</p>}
    {data&&!busy&&<><p>Jointly reviewed: {data.total_jointly_reviewed_results}; comparable: {data.comparable_results}; incomplete: {data.incomplete_results}.</p>
      <p>Exact agreement: {data.exact_agreement_count} ({data.exact_agreement_rate??'Unavailable'}%); disagreements: {data.disagreement_count} ({data.disagreement_rate??'Unavailable'}%).</p>
      {data.status==='insufficient_data'&&<p>Insufficient paired reviews. Choose two raters with jointly reviewed results.</p>}
      <div className="overflow-x-auto"><table aria-label="Inter-rater metric agreement" className="w-full text-left text-sm"><thead><tr>{['Metric','Matched n','Exact %','Rater A mean','Rater B mean','Kappa','Status / reason'].map(k=><th key={k}>{k}</th>)}</tr></thead><tbody>{data.metrics.map((m,i)=><tr key={i}>{['metric','matched_n','exact_agreement_percentage','mean_a','mean_b','kappa'].map(k=><td key={k}>{String(m[k]??'Unavailable')}</td>)}<td>{String(m.kappa_type??'')} {String(m.status)} {String(m.reason??'')}</td></tr>)}</tbody></table></div>
      <div className="overflow-x-auto"><table aria-label="Rater disagreements" className="w-full text-left text-sm"><thead><tr>{['Case ID','Model','Metric','Automated','Rater A','Rater B','Difference'].map(k=><th key={k}>{k}</th>)}</tr></thead><tbody>{data.disagreements.map((r,i)=><tr key={i}><td><button className="underline" onClick={()=>setDetail(r)}>{String(r.case_id)}</button></td>{['model','metric','automated','rater_a','rater_b','difference'].map(k=><td key={k}>{String(r[k]??'Unavailable')}</td>)}</tr>)}</tbody></table></div>
      {detail&&<section><h4>Disagreement evidence and researcher reasons</h4><pre className="max-h-96 overflow-auto whitespace-pre-wrap break-words text-xs">{JSON.stringify(detail,null,2)}</pre><button onClick={()=>setDetail(null)}>Close disagreement</button></section>}
    </>}
  </section>
}
