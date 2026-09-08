import { useEffect, useState } from 'react'
import { protocolApi, type Protocol, type ProtocolConfiguration, type StatisticalSettings } from '../../api/experiments'
import { researchApi } from '../../api/research'

export function EvaluationProtocols({projectId, analysisKeys, variantKey, included, statistics}: {
  projectId: string; analysisKeys: Record<string, string>; variantKey: string; included: boolean; statistics: StatisticalSettings
}) {
  const [items, setItems] = useState<Protocol[]>([])
  const [selected, setSelected] = useState<Protocol | null>(null)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [config, setConfig] = useState<ProtocolConfiguration | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [status, setStatus] = useState('')
  const [reload, setReload] = useState(0)
  useEffect(() => {
    const c = new AbortController()
    protocolApi.list(projectId, c.signal).then(data => {if (!c.signal.aborted) setItems(data)}).catch(() => {if (!c.signal.aborted) setError('Unable to load protocols.')})
    return () => c.abort()
  }, [projectId, reload])
  async function action(task: () => Promise<void>) {
    if (busy) return
    setBusy(true); setError(''); setStatus('')
    try {await task()} catch (e) {setError(e instanceof Error ? e.message : 'Protocol request failed.')}
    finally {setBusy(false)}
  }
  function load(p: Protocol) {setSelected(p); setName(p.name); setDescription(p.description); setConfig(p.configuration)}
  async function current() {
    const [{configuration}, profile] = await Promise.all([protocolApi.defaults(projectId), researchApi.metrics(projectId)])
    setConfig({...configuration, metrics: profile.metrics, analysis_metadata_keys: analysisKeys, variant_metadata_key: variantKey || null,
      include_ground_truth_warnings: included, statistics})
    setStatus('Current project metrics and dashboard settings loaded into the draft.')
  }
  return <section className="space-y-3"><h3 className="font-medium">Evaluation Protocols</h3>
    <p className="text-sm">Protocols store configuration only. Saving creates a new version; historical runs keep independent snapshots. Choose a protocol before Run Evaluation.</p>
    <select aria-label="Saved protocol" disabled={busy} value={selected?.id || ''} onChange={e => {const p=items.find(p => String(p.id)===e.target.value); if(p) load(p); else {setSelected(null); setName(''); setDescription(''); setConfig(null)}}}><option value="">New protocol</option>{items.map(p => <option key={p.id} value={p.id}>{p.name} — v{p.version}</option>)}</select>
    <button disabled={busy} onClick={() => setReload(n=>n+1)}>Reload saved protocols</button>
    <div className="flex flex-wrap gap-3"><button disabled={busy} onClick={() => void action(current)}>Use current configuration</button>
      <button disabled={busy} onClick={() => void action(async () => {setConfig((await protocolApi.defaults(projectId)).configuration); setStatus('Study defaults loaded into draft; save to apply.')} )}>Reset to study defaults</button></div>
    <label className="block">Protocol name<input className="ml-2 border p-1" aria-label="Protocol name" disabled={busy} value={name} onChange={e=>setName(e.target.value)}/></label>
    <label className="block">Description<textarea className="ml-2 border p-1" aria-label="Protocol description" disabled={busy} value={description} onChange={e=>setDescription(e.target.value)}/></label>
    {config && <><p>Draft metric weights (edit other settings in the dashboard, then use current configuration):</p>{config.metrics.map((m,i)=><label className="mr-3 inline-block" key={m.key}><input disabled={busy} type="checkbox" aria-label={`Protocol enable ${m.key}`} checked={m.enabled} onChange={e=>setConfig({...config, metrics: config.metrics.map((v,j)=>i===j?{...v,enabled:e.target.checked}:v)})}/>{m.name}<input className="w-20 border" type="number" min="0" step="any" aria-label={`Protocol weight ${m.key}`} disabled={busy} value={m.weight} onChange={e=>setConfig({...config,metrics:config.metrics.map((v,j)=>i===j?{...v,weight:Number(e.target.value)}:v)})}/></label>)}<details><summary>Inspect configuration</summary><pre className="max-h-80 overflow-auto whitespace-pre-wrap break-words text-xs">{JSON.stringify(config,null,2)}</pre></details></>}
    <div className="flex gap-3"><button disabled={busy || !name.trim() || !config} onClick={()=>void action(async()=>{const p=await protocolApi.save(projectId,{name,description,configuration:config!,...(selected?{expected_version:selected.version}:{})},selected?.id); load(p); setReload(n=>n+1); setStatus(`Saved version ${p.version}.`)})}>{selected?'Save new version / rename':'Save protocol'}</button>
      <button disabled={busy || !selected} onClick={()=>void action(async()=>{load(await protocolApi.duplicate(projectId,selected!.id)); setReload(n=>n+1); setStatus('Protocol duplicated.')})}>Duplicate protocol</button>
      <button disabled={busy || !selected} onClick={()=>{if(window.confirm('Delete this protocol? Historical runs keep their snapshots.')) void action(async()=>{await protocolApi.delete(projectId,selected!.id); setSelected(null);setConfig(null);setName('');setDescription('');setReload(n=>n+1);setStatus('Protocol deleted.')})}}>Delete protocol</button></div>
    {busy&&<p role="status">Saving/loading protocol…</p>}{status&&<p role="status">{status}</p>}{error&&<p role="alert">{error}</p>}
  </section>
}
