import { useEffect, useState } from 'react'
import { experimentApi, type VariantResult, type StatisticsResult, type StatisticalSettings } from '../../api/experiments'
import type { ResearchRecord } from '../../api/research'

function display(value: unknown) {
  if (value === null || value === undefined) return 'Not Available'
  return typeof value === 'object' ? JSON.stringify(value) : String(value)
}
function EvidenceTable({rows, columns, label}: {rows: ResearchRecord[]; columns: string[]; label: string}) {
  return <div className="overflow-x-auto"><table aria-label={label} className="w-full text-left text-sm"><thead><tr>{columns.map(k=><th className="p-2" key={k}>{k.replaceAll('_',' ')}</th>)}</tr></thead><tbody>{rows.map((r,i)=><tr key={i} className="border-t">{columns.map(k=><td className="max-w-xs break-words p-2" key={k}>{display(r[k])}</td>)}</tr>)}</tbody></table></div>
}

export function VariantComparison({projectId, query}: {projectId: string; query: string}) {
  const [data,setData]=useState<VariantResult|null>(null)
  const [busy,setBusy]=useState(true)
  const [error,setError]=useState('')
  const [retry,setRetry]=useState(0)
  useEffect(()=>{
    const c=new AbortController();setData(null);setBusy(true);setError('')
    experimentApi.variants(projectId,query,c.signal).then(d=>{if(!c.signal.aborted)setData(d)})
      .catch(()=>{if(!c.signal.aborted)setError('Unable to load variant comparison.')})
      .finally(()=>{if(!c.signal.aborted)setBusy(false)})
    return ()=>c.abort()
  },[projectId,query,retry])
  return <section className="space-y-3"><h3 className="font-medium">Variant Comparison</h3>
    <p>Experiment Variant metadata: {data?.metadata_key || 'Choose a metadata key above'}. Deltas are B minus A in percentage points. Summary populations are descriptive; pairwise metrics use matched cases only.</p>
    {busy&&<p role="status">Loading variant comparison…</p>}{error&&<p role="alert">{error} <button onClick={()=>setRetry(n=>n+1)}>Retry variants</button></p>}
    {data&&!busy&&<>{data.reason&&<p>{data.reason}</p>}<h4>Variant Summary</h4><EvidenceTable label="Variant Summary" rows={data.summaries} columns={['variant','response_count','matched_cases','average_overall_accuracy','reliability','hallucination_rate','average_component_scores']}/>
      <h4>Pairwise Comparison</h4><EvidenceTable label="Variant pairs" rows={data.comparisons} columns={['model','variant_a','variant_b','matched_case_count','average_accuracy_a','average_accuracy_b','accuracy_delta_percentage_points','accuracy_matched_n','reliability_a','reliability_b','reliability_delta','reliability_matched_n','hallucination_rate_a','hallucination_rate_b','hallucination_delta','unmatched_case_count','ambiguous_case_count','excluded_count']}/>
      {data.comparisons.map((pair,i)=><details key={i}><summary>{String(pair.model)}: {String(pair.variant_a)} → {String(pair.variant_b)} — component differences and matching notes</summary><pre className="max-h-72 overflow-auto whitespace-pre-wrap text-xs">{JSON.stringify({components:pair.component_differences,notes:pair.notes,status:pair.status},null,2)}</pre></details>)}
    </>}
  </section>
}

export function StatisticalComparison({projectId, run, model, strategyKey, variantKey, included, settings, onSettings}: {
  projectId:string;run:string;model:string;strategyKey:string;variantKey:string;included:boolean;
  settings:StatisticalSettings;onSettings:(s:StatisticalSettings)=>void
}) {
  const [type,setType]=useState('models')
  const [metric,setMetric]=useState('overall_accuracy')
  const [data,setData]=useState<StatisticsResult|null>(null)
  const [groups,setGroups]=useState<string[]>([])
  const [selected,setSelected]=useState<string[]>([])
  const [busy,setBusy]=useState(false)
  const [error,setError]=useState('')
  const [request,setRequest]=useState(0)
  const [calculate,setCalculate]=useState(false)
  const metadataKey=type==='strategies'?strategyKey:variantKey
  const unavailable=type!=='models'&&(!model||!metadataKey)
  // Scope changes invalidate both results and selected group names.
  const scope=JSON.stringify([projectId,run,model,type,metric,strategyKey,variantKey,included])
  useEffect(()=>{setSelected([]);setCalculate(false);setGroups([]);setData(null)},[scope])
  useEffect(()=>{
    const c=new AbortController();setData(null);setError('')
    if(unavailable){setBusy(false);return ()=>c.abort()}
    const query=new URLSearchParams({comparison_type:type,metric,include_ground_truth_warnings:String(included),enabled:String(calculate&&settings.enabled),alpha:String(settings.alpha),correction:settings.correction})
    if(run)query.set('run_id',run)
    if(type!=='models'){query.set('model',model);query.set('metadata_key',metadataKey)}
    if(calculate&&selected.length)selected.forEach(g=>query.append('groups',g))
    setBusy(true)
    experimentApi.statistics(projectId,query.toString(),c.signal).then(d=>{if(!c.signal.aborted){setData(d);setGroups(d.groups)}})
      .catch(()=>{if(!c.signal.aborted)setError('Unable to load statistical comparison. Check groups and retry.')})
      .finally(()=>{if(!c.signal.aborted)setBusy(false)})
    return ()=>c.abort()
    // Group selection is a draft; only the action submits it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[scope,request,calculate,settings.enabled,settings.alpha,settings.correction])
  function toggle(group:string){setData(null);setSelected(old=>old.includes(group)?old.filter(g=>g!==group):[...old,group])}
  return <section className="space-y-3"><h3 className="font-medium">Statistical Comparison</h3>
    <p>Statistical results supplement descriptive analysis and depend on matched sample size and experimental design.</p>
    <div className="flex flex-wrap gap-3"><label>Comparison Type <select aria-label="Comparison Type" value={type} onChange={e=>setType(e.target.value)}><option value="models">Models</option><option value="strategies">Strategies</option><option value="variants">Experiment Variants</option></select></label>
      <label>Metric <select aria-label="Statistical metric" value={metric} onChange={e=>setMetric(e.target.value)}><option value="overall_accuracy">Overall Accuracy</option><option value="execution">Execution Success</option><option value="hallucination">Hallucination</option></select></label>
      <label><input aria-label="Enable statistics" type="checkbox" checked={settings.enabled} onChange={e=>onSettings({...settings,enabled:e.target.checked})}/> Enable statistical testing</label>
      <label>Alpha <input aria-label="Statistical alpha" className="w-20 border" type="number" min="0.001" max="0.999" step="0.001" value={settings.alpha} onChange={e=>onSettings({...settings,alpha:Number(e.target.value)})}/></label>
      <label>Correction <select aria-label="Multiple comparison correction" value={settings.correction} onChange={e=>onSettings({...settings,correction:e.target.value as 'none'|'holm'})}><option value="holm">Holm</option><option value="none">None</option></select></label></div>
    <p>{type==='models'?'Model comparisons use all models in the selected run; ambiguous repeated Case IDs are excluded.':`Within model ${model || '(choose above)'}, metadata ${metadataKey || '(choose above)'}.`}</p>
    {unavailable&&<p>Choose a model and the corresponding strategy/variant metadata key above.</p>}
    <fieldset disabled={busy}><legend>Select groups (leave all unchecked for all pairs)</legend>{groups.map(g=><label className="mr-3 inline-block" key={g}><input type="checkbox" checked={selected.includes(g)} onChange={()=>toggle(g)}/>{g}</label>)}</fieldset>
    <button disabled={busy||unavailable||selected.length===1||!(settings.alpha>0&&settings.alpha<1)} onClick={()=>{setCalculate(true);setRequest(n=>n+1)}}>Compare selected groups</button>
    {busy&&<p role="status">Loading statistical comparison…</p>}{error&&<p role="alert">{error}</p>}
    {data&&!busy&&<><p>Correction: {data.correction}; successful tests in this request: {data.family_size}.</p>{!data.comparisons.length&&<p>Insufficient data: fewer than two comparable groups.</p>}
      {data.comparisons.map((r,i)=><section key={i} className="rounded border p-3"><h4>{String(r.group_a)} / {String(r.group_b)} — {String(r.status)}</h4><EvidenceTable label={`Statistical pair ${i+1}`} rows={[r]} columns={['matched_n','original_matched_count','excluded_count','final_matched_count','unmatched_case_count','ambiguous_case_count','invalid_pair_count','mean_a','mean_b','median_a','median_b','mean_difference_percentage_points','median_difference','test_name','statistic','raw_p_value','adjusted_p_value','effect_size','discordant_a0_b1','discordant_a1_b0']}/><p className="text-sm">{(r.notes as string[]).join(' ')}</p></section>)}
      <p className="text-sm">{data.notes.join(' ')}</p></>}
  </section>
}
