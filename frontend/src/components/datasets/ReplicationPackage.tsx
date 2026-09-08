import {useEffect,useState} from 'react'
import {reproducibilityApi,type ReproducibilityAudit} from '../../api/reproducibility'

export function ReplicationPackage({projectId,run,included}:{projectId:string;run:string;included:boolean}){
  const [audit,setAudit]=useState<ReproducibilityAudit|null>(null),[error,setError]=useState(''),[busy,setBusy]=useState(false),[auditing,setAuditing]=useState(false)
  const [analysis,setAnalysis]=useState(true),[statistics,setStatistics]=useState(false),[xlsx,setXlsx]=useState(true),[reload,setReload]=useState(0)
  const [download,setDownload]=useState<{url:string;scope:string}|null>(null)
  const scope=JSON.stringify([projectId,run,included,analysis,statistics,xlsx])
  useEffect(()=>{
    const c=new AbortController();setAudit(null);setError('');setDownload(null)
    if(!run)return ()=>c.abort()
    setAuditing(true)
    reproducibilityApi.audit(projectId,run,included,c.signal).then(d=>{if(!c.signal.aborted)setAudit(d)})
      .catch(()=>{if(!c.signal.aborted)setError('Unable to audit this run. Please retry.')}).finally(()=>{if(!c.signal.aborted)setAuditing(false)})
    return ()=>c.abort()
  },[projectId,run,included,reload])
  useEffect(()=>()=>{if(download)URL.revokeObjectURL(download.url)},[download])
  async function generate(){
    if(busy||!audit||!run)return
    setBusy(true);setError('');setDownload(null)
    try{const blob=await reproducibilityApi.package(projectId,run,new URLSearchParams({include_ground_truth_warnings:String(included),include_analysis:String(analysis),include_statistics:String(statistics),include_xlsx:String(xlsx)}).toString());setDownload({url:URL.createObjectURL(blob),scope})}
    catch(e){setError(e instanceof Error?e.message:'Unable to generate package.')}
    finally{setBusy(false)}
  }
  return <section className="space-y-3"><h3 className="font-medium">Replication Package</h3>
    <p>Choose a run above. The package preserves available evidence and configuration; recognizable secrets and local paths are redacted. Ground-truth warnings are {included?'included':'excluded'}.</p>
    {!run&&<p>Select a run before generating a package.</p>}{auditing&&<p role="status">Auditing reproducibility data…</p>}
    {audit&&<><p>Audit: {audit.status}</p><ul>{audit.checks.map(c=><li key={c.key}>{c.passed?'✓':'⚠'} {c.key.replaceAll('_',' ')}</li>)}</ul>{audit.warnings.map((w,i)=><p key={i} className="text-amber-800">⚠ {w}</p>)}<p>{audit.selected_results} selected; {audit.filtered_results} excluded responses.</p></>}
    <fieldset disabled={busy}><legend>Optional package components</legend><label className="mr-3"><input type="checkbox" checked={analysis} onChange={e=>setAnalysis(e.target.checked)}/>Descriptive analyses</label><label className="mr-3"><input type="checkbox" checked={statistics} onChange={e=>setStatistics(e.target.checked)}/>Statistical comparisons (run protocol settings)</label><label><input type="checkbox" checked={xlsx} onChange={e=>setXlsx(e.target.checked)}/>Existing XLSX export</label></fieldset>
    <button disabled={busy||auditing||!audit} onClick={()=>void generate()}>Generate Replication Package</button><button className="ml-3 underline" disabled={busy||!run} onClick={()=>setReload(n=>n+1)}>Refresh audit</button>
    {busy&&<p role="status">Generating replication package…</p>}{error&&<p role="alert">{error}</p>}
    {download&&download.scope===scope&&<p role="status">Package generated. <a className="underline" href={download.url} download={`replication-run-${run}.zip`}>Download ZIP</a></p>}
  </section>
}
