import { useEffect, useState } from 'react'
import { protocolApi, type Protocol, type ProtocolSelection } from '../../api/experiments'

export function ProtocolSelector({projectId, disabled, onChange}: {projectId: string; disabled: boolean; onChange: (selection: ProtocolSelection) => void}) {
  const [items, setItems] = useState<Protocol[]>([])
  const [selected, setSelected] = useState('study')
  const [error, setError] = useState('')
  const [reload, setReload] = useState(0)
  useEffect(() => {
    const c = new AbortController()
    protocolApi.list(projectId, c.signal).then(data => {if (!c.signal.aborted) {setItems(data); setError('')}})
      .catch(() => {if (!c.signal.aborted) setError('Saved protocols unavailable. Built-in study defaults and current project settings remain available.')})
    return () => c.abort()
  }, [projectId, reload])
  return <div><label>Evaluation Protocol <select aria-label="Evaluation Protocol" disabled={disabled} value={selected} onChange={e => {
    const value = e.target.value; setSelected(value)
    const item = items.find(p => String(p.id) === value)
    onChange(item ? {protocol_id: item.id, protocol_version: item.version} : value === 'study' ? {use_study_default: true} : {})
  }}><option value="study">Study Default</option><option value="current">Current project settings</option>{items.map(p => <option key={p.id} value={p.id}>{p.name} — v{p.version}</option>)}</select></label>
    {error && <p role="status">{error}</p>}<button disabled={disabled} className="ml-2 underline" onClick={() => setReload(v => v+1)}>Reload protocols</button></div>
}
