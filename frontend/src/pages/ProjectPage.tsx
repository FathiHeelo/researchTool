import { useEffect, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { projectsApi, evaluationApi, type Project, type EvaluationRun } from '../api/client'
import { DatasetUpload } from '../components/datasets/DatasetUpload'
import { ResultsExplorer } from '../components/datasets/ResultsExplorer'
import { ResearchDashboard } from '../components/datasets/ResearchDashboard'
import { ResearchAnalytics } from '../components/datasets/ResearchAnalytics'
import { ReportActions } from '../components/datasets/ReportPrimitives'
import { ThemeIcon } from '../components/ThemeIcon'

export function ProjectPage() {
 const {projectId=''}=useParams()
 const [params,setParams]=useSearchParams()
 const view=params.get('view')||'overview', runId=params.get('run')||''
 const [project,setProject]=useState<Project|null>(null)
 const [runs,setRuns]=useState<EvaluationRun[]>([])
 const [error,setError]=useState(''),[runError,setRunError]=useState(''),[reload,setReload]=useState(0)
 useEffect(()=>{
  const c=new AbortController();setProject(null);setError('');setRuns([]);setRunError('')
  projectsApi.get(projectId,c.signal).then(p=>{if(!c.signal.aborted)setProject(p)}).catch(()=>{if(!c.signal.aborted)setError('Unable to load project.')})
  evaluationApi.list(projectId,c.signal).then(r=>{if(!c.signal.aborted)setRuns(r)}).catch(()=>{if(!c.signal.aborted)setRunError('Unable to load saved runs.')})
  return ()=>c.abort()
 },[projectId,reload])
 const changeRun=(id:string)=>setParams(old=>{const next=new URLSearchParams(old);if(id)next.set('run',id);else next.delete('run');return next})
 const selected=runs.find(r=>String(r.id)===runId)
 const summary=selected?.summary as Record<string,unknown>|undefined
 const tabs:Record<string,string>={'research':'Overview','ground-truth':'Ground Truth','metrics':'Metrics','protocols':'Evaluation Protocols','export':'Export','statistics':'Statistical Comparison','agreement':'Agreement'}
 const analysisView=view in tabs
 return <div className="workspace-page">
  <header className="workspace-topbar no-print"><div className="workspace-breadcrumb"><Link to="/projects">Projects</Link><span>/</span><strong dir="auto">{project?.name||'Research workspace'}</strong><span>/</span><label className="sr-only" htmlFor="workspace-run">Workspace run</label><select id="workspace-run" value={runId} onChange={e=>changeRun(e.target.value)}><option value="">All saved runs</option>{runs.map(r=><option key={r.id} value={r.id}>Run #{r.id}</option>)}</select>{selected&&<span className="run-state" data-state={selected.status}>{selected.status}</span>}</div><div className="workspace-actions">{summary?.evaluator_version!=null&&<span className="version-chip">Evaluator {String(summary.evaluator_version)}</span>}<ReportActions projectId={projectId} run={selected}/><Link className="primary-action" to={`?view=dataset${runId?`&run=${runId}`:''}`}><ThemeIcon name="play"/>New Evaluation Run</Link></div></header>
  {error?<div role="alert">{error}<button onClick={()=>setReload(n=>n+1)}>Try again</button></div>:!project?<p role="status">Loading project…</p>:<>
   {runError&&<div role="alert">{runError}<button onClick={()=>setReload(n=>n+1)}>Reload runs</button></div>}
   {view==='overview'&&<ResearchDashboard key={projectId} projectId={projectId} selectedRunId={runId} onRunChange={changeRun}/>}
   <div hidden={!['dataset','evaluation'].includes(view)}><div className="screen-heading"><h1>{view==='evaluation'?'Evaluation':'Datasets & Mapping'}</h1><p>Prepare your benchmark and evaluate mapped responses with the saved research configuration.</p></div><DatasetUpload key={projectId}/></div>
   {view==='results'&&<ResultsExplorer key={projectId} projectId={projectId} selectedRunId={runId} onRunChange={changeRun}/>}
   {analysisView&&<ResearchAnalytics key={projectId} projectId={projectId} initialTab={tabs[view]} selectedRunId={runId} onRunChange={changeRun}/>}
   {!['overview','dataset','evaluation','results'].includes(view)&&!analysisView&&<p>Choose a section from the navigation.</p>}
   <footer className="workspace-footer"><span>PROJECT {project.id}</span><span dir="auto">{project.name}</span><span>Persisted results · Accepted research scores</span></footer>
  </>}
 </div>
}
