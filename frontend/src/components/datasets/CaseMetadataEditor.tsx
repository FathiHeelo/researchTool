import { useMemo, useState } from 'react'
import type { MetadataEntry, NormalizedImport } from '../../api/client'

function valueOf(entries: MetadataEntry[], key: string) {
  const value = entries.find(entry => (entry.label || entry.key) === key)?.value
  return value == null ? '' : String(value)
}
function replace(entries: MetadataEntry[], key: string, value: string | null): MetadataEntry[] {
  let found = false
  const updated = entries.map(entry => {
    if ((entry.label || entry.key) !== key) return entry
    found = true
    return {...entry, key: entry.key || key, label: entry.label || key, value}
  })
  return found ? updated : [...updated, {key, label: key, value, source: 'case_editor'}]
}

export function CaseMetadataEditor({value, onChange}: {value: NormalizedImport; onChange: (value: NormalizedImport) => void}) {
  const existing = [...new Set(value.cases.flatMap(item => item.metadata.map(entry => entry.label || entry.key || '')).filter(Boolean))]
  const [createdFields,setCreatedFields] = useState<string[]>([])
  const fields = [...new Set([...existing, ...createdFields])]
  const [key,setKey] = useState(existing[0] || '')
  const [creating,setCreating] = useState(false)
  const [newField,setNewField] = useState('')
  const [fieldError,setFieldError] = useState('')
  const [search,setSearch] = useState('')
  const [selected,setSelected] = useState<string[]>([])
  const [bulk,setBulk] = useState('')
  const [saved,setSaved] = useState(false)
  const shown = useMemo(() => value.cases.filter(item => `${item.case_id} ${item.requirement}`.toLowerCase().includes(search.toLowerCase())), [value.cases,search])
  function assign(caseIds: string[], metadataValue: string) {
    if (!key.trim()) return
    const ids = new Set(caseIds)
    const cases = value.cases.map(item => ids.has(item.id) ? {...item, metadata: replace(item.metadata,key.trim(),metadataValue || null)} : item)
    const responses = value.responses.map(item => ids.has(item.case_reference) ? {...item, metadata: replace(item.metadata || [],key.trim(),metadataValue || null)} : item)
    onChange({...value,cases,responses}); setSaved(false)
  }
  function createField() {
    const name = newField.trim()
    if (!name) {setFieldError('Enter a metadata field name.'); return}
    if (fields.includes(name)) {setFieldError('A metadata field with this name already exists.'); return}
    const cases = value.cases.map(item => ({...item, metadata: replace(item.metadata,name,null)}))
    const responses = value.responses.map(item => ({...item, metadata: replace(item.metadata || [],name,null)}))
    setCreatedFields(items => [...items,name]); setKey(name); setNewField(''); setCreating(false); setFieldError(''); setSaved(false)
    onChange({...value,cases,responses})
  }
  return <section aria-label="Case Metadata Editor" className="space-y-3 rounded border p-3">
    <div><h4 className="font-medium">Case Metadata Editor</h4><p className="text-sm">Assign researcher-authored per-case labels. No values are inferred from rules or model output.</p></div>
    <div className="flex flex-wrap gap-2"><label>Metadata field <select aria-label="Case metadata field" value={key} onChange={event=>{setKey(event.target.value);setSaved(false)}}><option value="">Select a metadata field</option>{fields.map(item=><option key={item} value={item}>{item}</option>)}</select></label>
      <button type="button" onClick={()=>{setCreating(show=>!show);setFieldError('')}}>+ Create Metadata Field</button>
      <label>Search <input aria-label="Case metadata search" value={search} onChange={event=>setSearch(event.target.value)} placeholder="Case ID or requirement"/></label></div>
    {creating&&<div className="flex flex-wrap gap-2"><label>Field Name <input aria-label="New metadata field name" value={newField} onChange={event=>{setNewField(event.target.value);setFieldError('')}} placeholder="Data Quality Dimension"/></label><button type="button" onClick={createField}>Create</button><button type="button" onClick={()=>{setCreating(false);setNewField('');setFieldError('')}}>Cancel</button></div>}
    {fieldError&&<p role="alert">{fieldError}</p>}
    <div className="flex flex-wrap gap-2"><input aria-label="Bulk metadata value" value={bulk} onChange={event=>setBulk(event.target.value)} placeholder="Arbitrary value"/><button type="button" disabled={!selected.length || !key.trim()} onClick={()=>assign(selected,bulk)}>Assign to selected ({selected.length})</button><button type="button" onClick={()=>setSelected(shown.map(item=>item.id))}>Select filtered</button><button type="button" onClick={()=>setSelected([])}>Clear selection</button></div>
    <div className="max-h-80 overflow-auto"><table aria-label="Case metadata"><thead><tr><th>Select</th><th>Case ID</th><th>Requirement</th><th>Current value</th></tr></thead><tbody>{shown.map(item=><tr key={item.id}><td><input aria-label={`Select case ${item.case_id}`} type="checkbox" checked={selected.includes(item.id)} onChange={()=>setSelected(old=>old.includes(item.id)?old.filter(id=>id!==item.id):[...old,item.id])}/></td><td>{String(item.case_id)}</td><td>{String(item.requirement ?? '')}</td><td><input aria-label={`Metadata for case ${item.case_id}`} value={valueOf(item.metadata,key)} onChange={event=>assign([item.id],event.target.value)}/></td></tr>)}</tbody></table></div>
    {!shown.length&&<p className="empty-state">No cases match this search.</p>}
    <button type="button" onClick={()=>setSaved(true)}>Save case metadata</button>{saved&&<p role="status">Case metadata saved in this imported research dataset.</p>}
  </section>
}
