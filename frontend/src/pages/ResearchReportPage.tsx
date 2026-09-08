import { useEffect, useRef, useState } from 'react'
import { useParams, useSearchParams } from 'react-router-dom'
import { loadReport, type ReportData } from '../api/report'
import { analystSections } from '../api/research'
import { display, EvidenceTable, ModelPerformance, percent } from '../components/datasets/ReportPrimitives'

const sections = ['Executive Summary','Model Performance','Error Analysis','Ground Truth','Statistical Analysis','Detailed Results'] as const
export function ResearchReportPage() {
  const {projectId = '', runId = ''} = useParams()
  const [params] = useSearchParams()
  const [data,setData] = useState<ReportData | null>(null)
  const [error,setError] = useState('')
  const [progress,setProgress] = useState('Loading report context…')
  const [retry,setRetry] = useState(0)
  const [enabled,setEnabled] = useState<string[]>([...sections])
  const printed = useRef(false)
  useEffect(() => {
    const c = new AbortController(); setData(null); setError(''); setProgress('Loading report context…'); printed.current=false
    loadReport(projectId,runId,c.signal,(n,total)=>{if(!c.signal.aborted)setProgress(`Loading accepted results: ${n} / ${total}`)})
      .then(d=>{if(!c.signal.aborted)setData(d)})
      .catch(()=>{if(!c.signal.aborted)setError('Unable to load the complete report. Check that the run is completed and the backend is available, then retry.')})
    return ()=>c.abort()
  },[projectId,runId,retry])
  useEffect(()=>{
    if (!data || params.get('print')!=='1' || printed.current) return
    const timer=window.setTimeout(()=>{printed.current=true;window.print()},0)
    return ()=>window.clearTimeout(timer)
  },[data,params])
  if (error) return <div role="alert">{error} <button onClick={()=>setRetry(n=>n+1)}>Retry report</button></div>
  if (!data) return <p role="status">{progress}</p>
  return <><div className="report-toolbar no-print"><a href={`/projects/${encodeURIComponent(projectId)}`}>Back to project</a><h1>Full Research Report</h1><button className="primary-action" onClick={()=>window.print()}>Print / Save as PDF</button><fieldset><legend>Include in report</legend>{sections.map(s=><label key={s}><input type="checkbox" checked={enabled.includes(s)} onChange={()=>setEnabled(old=>old.includes(s)?old.filter(x=>x!==s):[...old,s])}/>{s}</label>)}</fieldset></div><ReportContent data={data} enabled={enabled}/></>
}

export function ReportContent({data,enabled}: {data: ReportData; enabled: string[]}) {
  const {project,run,dashboard:d,analysis:a,analyst,details} = data
  const metrics=run.summary.metric_configuration ?? run.summary.protocol_snapshot?.configuration.metrics ?? []
  const warnings=details.flatMap(r=>r.ground_truth_warnings.map(w=>({case_id:r.case_id,model:r.model,warning_type:w.warning_type,severity:w.severity,expected_rule:(r.snapshot as {case?:{expected_rule?:unknown}})?.case?.expected_rule,message:w.message})))
  const stats=run.summary.statistical_comparisons
  const statisticalRows=Array.isArray(stats)?stats.filter((r):r is Record<string,unknown>=>!!r&&typeof r==='object'&&!Array.isArray(r)):[]
  return <article className="research-report" aria-label="Research Evaluation Report">
    <header className="report-header"><p className="eyebrow">DQ-LLM Evaluator · Research record</p><h1>Research Evaluation Report</h1><h2 dir="auto">{project.name}</h2><dl className="context-grid">{Object.entries({'Run ID':run.id,'Run status':run.status,'Generated':data.generated,'Evaluator version':run.summary.evaluator_version,'Protocol':run.summary.protocol_snapshot?.name,'Protocol version':run.summary.protocol_snapshot?.protocol_version,'Ground Truth inclusion policy':data.included?'Include flagged cases in aggregates':'Exclude flagged cases from aggregates'}).map(([k,v])=><div key={k}><dt>{k}</dt><dd>{display(v)}</dd></div>)}</dl><p className="muted">Persisted results and current accepted researcher scores at report generation. No evaluation is performed. The appendix and warning inventory include all saved responses, including any excluded from aggregates.</p></header>
    {enabled.includes('Executive Summary')&&<section className="report-section"><h2>Executive Summary</h2><div className="kpi-grid">{Object.entries({'Benchmark Cases':d.total_unique_cases,'Responses Evaluated':d.total_evaluated_responses,'Models':d.total_models,'Overall Accuracy':percent(d.average_overall_accuracy),'Reliability':percent(d.reliability),'Hallucination Rate':percent(d.hallucination_rate),'Ground Truth Warnings':d.ground_truth_warning_results}).map(([k,v])=><div className="kpi" key={k}><span>{k}</span><strong>{v}</strong></div>)}</div>{Object.entries(analystSections).map(([key,label])=>{const findings=analyst[key as keyof typeof analystSections]??[];return findings.length?<section key={key}><h3>{label}</h3>{findings.map((f,i)=><p dir="auto" key={i}>{f.text} <small className="muted">[{f.supporting_metric}; evidence count: {f.evidence_count}]</small></p>)}</section>:null})}</section>}
    {enabled.includes('Model Performance')&&<section className="report-section"><h2>Model Performance Summary</h2><ModelPerformance models={d.models}/></section>}
    <EvidenceTable title="Metric Definitions — Run Snapshot" rows={metrics.map(m=>({metric:m.name||m.key,key:m.key,enabled:m.enabled,weight:m.weight,score_scale:`${m.min_score}–${m.max_score}`,description:m.description}))}/>
    <section className="report-section"><h3>Definitions</h3><p>Overall Accuracy: the existing accepted weighted overall score, using the run’s metric configuration; automated scores apply where no researcher override exists. Unavailable scores remain unavailable.</p><p>Reliability: execution success count / total responses × 100.</p><p>Hallucination Rate: responses with hallucination / total responses × 100.</p></section>
    <EvidenceTable title="Prompt Strategy Analysis" rows={a.strategies}/><EvidenceTable title="Matched Case Delta" rows={a.strategy_deltas}/><EvidenceTable title="Data Quality Dimension Analysis" rows={a.dimensions}/><EvidenceTable title="Agreement Analysis" rows={a.agreement}/>
    {enabled.includes('Statistical Analysis')&&<><EvidenceTable title="Statistical Comparisons" rows={statisticalRows}/><p>Statistical results supplement descriptive analysis and depend on matched sample size and experimental design.</p>{!statisticalRows.length&&<p className="muted">No statistical comparison snapshot is available for this run. Interactive, unsaved comparisons are not recreated by this report.</p>}</>}
    {enabled.includes('Error Analysis')&&<><EvidenceTable title="Error Analysis" rows={Object.entries(d.error_tag_counts).map(([error_type,count])=>({error_type,count,occurrence_percent:d.total_evaluated_responses?count/d.total_evaluated_responses*100:0}))}/><p className="muted">Multiple tags may occur on a response; occurrence rates need not sum to 100%.</p></>}
    <section className="report-section"><h2>Hallucination Analysis</h2><p>Overall rate: {percent(d.hallucination_rate)}</p><EvidenceTable title="Hallucination Rate by Model" rows={d.models.map(m=>({model:m.model,hallucination_rate:percent(m.hallucination_rate)}))}/><EvidenceTable title="Hallucinated Functions" rows={Object.entries(a.hallucinated_functions).sort((a,b)=>b[1]-a[1]).map(([name,count])=>({name,count}))}/></section>
    {enabled.includes('Ground Truth')&&<EvidenceTable title="Ground Truth Warnings" rows={warnings}/>}
    {enabled.includes('Detailed Results')&&<section className="report-section appendix"><h2>Detailed Results — Complete Appendix</h2><p>{details.length} saved responses. Metric values use the configured scales.</p>{!details.length&&<p>No evaluated responses.</p>}{details.map(r=>{
      const s=r.snapshot as {case?:{requirement?:unknown;expected_rule?:unknown};response?:{generated_output?:unknown}}
      const keys=[...new Set([...Object.keys(r.automated_scores),...Object.keys(r.override_scores),...Object.keys(r.accepted_scores)])]
      return <section className="result-record" key={r.id}><h3 dir="auto">{r.case_id} · {r.model}</h3><p>Accepted Overall Accuracy: {percent(r.accepted_overall_accuracy)} · Hallucination: {r.hallucination_detected?'Yes':'No'} · Ground Truth Warning: {r.ground_truth_warning?'Yes':'No'}</p>{[['Requirement',s.case?.requirement],['Expected Rule',s.case?.expected_rule],['Generated Output',s.response?.generated_output]].map(([k,v])=><div key={String(k)}><h4>{String(k)}</h4><pre dir="auto">{display(v)}</pre></div>)}<EvidenceTable title={`Scores — ${r.case_id} / ${r.model}`} rows={keys.map(k=>({metric:k,automated:r.automated_scores[k],override:r.override_scores[k],accepted:r.accepted_scores[k]}))}/><p>Error Tags: {r.error_tags.join(', ')||'None'}</p><p>Notes: {r.notes.join('; ')||'None'}</p><p>Researcher note: {r.review_note||'None'}</p></section>
    })}</section>}
    <footer>DQ-LLM Evaluator · Project {project.id} · Run {run.id} · Generated {data.generated}</footer>
  </article>
}
