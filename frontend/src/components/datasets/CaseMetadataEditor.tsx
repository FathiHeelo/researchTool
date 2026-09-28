import { useMemo, useState } from 'react'
import type { MetadataEntry, NormalizedImport } from '../../api/client'

type BulkStatus = 'Ready' | 'Unknown Case ID' | 'Duplicate Case ID' | 'Empty Value' | 'Invalid Line'
export interface BulkMetadataRow {
  line: number
  caseId: string
  caseReference?: string
  currentValue: string
  newValue: string
  status: BulkStatus
}

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

function comparableCaseId(value: unknown) {
  const text = String(value ?? '').trim()
  return /^\d+$/.test(text) ? text.replace(/^0+(?=\d)/, '') : text
}

export function parseBulkMetadata(text: string, cases: NormalizedImport['cases'], key: string): BulkMetadataRow[] {
  const parsed = text.split(/\r?\n/).map((source, index) => ({source,index:index+1})).filter(item => item.source.trim())
  const rows = parsed.map(({source,index}) => {
    const delimiter = source.includes('\t') ? '\t' : ','
    const parts = source.split(delimiter)
    const caseId = (parts[0] || '').trim()
    const newValue = parts.length === 2 ? parts[1].trim() : ''
    if (parts.length !== 2 || !caseId) return {line:index,caseId,newValue,currentValue:'',status:'Invalid Line' as BulkStatus}
    const exact = cases.filter(item => String(item.case_id).trim() === caseId)
    const normalized = cases.filter(item => comparableCaseId(item.case_id) === comparableCaseId(caseId))
    const matches = exact.length ? exact : normalized
    if (matches.length !== 1) return {line:index,caseId,newValue,currentValue:'',status:'Unknown Case ID' as BulkStatus}
    const item = matches[0]
    return {line:index,caseId:String(item.case_id),caseReference:item.id,currentValue:valueOf(item.metadata,key),newValue,
      status:(newValue ? 'Ready' : 'Empty Value') as BulkStatus}
  })
  const counts = new Map<string,number>()
  for (const row of rows) {
    const identity = row.caseReference || (row.caseId ? comparableCaseId(row.caseId) : '')
    if (identity) counts.set(identity,(counts.get(identity)||0)+1)
  }
  return rows.map(row => {
    const identity = row.caseReference || (row.caseId ? comparableCaseId(row.caseId) : '')
    return identity && (counts.get(identity)||0)>1 ? {...row,status:'Duplicate Case ID'} : row
  })
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
  const [paste,setPaste] = useState('')
  const [preview,setPreview] = useState<BulkMetadataRow[] | null>(null)
  const [pasteApplied,setPasteApplied] = useState(false)
  const [saved,setSaved] = useState(false)
  const shown = useMemo(() => value.cases.filter(item => `${item.case_id} ${item.requirement}`.toLowerCase().includes(search.toLowerCase())), [value.cases,search])
  function assign(caseIds: string[], metadataValue: string) {
    if (!key.trim()) return
    const ids = new Set(caseIds)
    const cases = value.cases.map(item => ids.has(item.id) ? {...item, metadata: replace(item.metadata,key.trim(),metadataValue || null)} : item)
    const responses = value.responses.map(item => ids.has(item.case_reference) ? {...item, metadata: replace(item.metadata || [],key.trim(),metadataValue || null)} : item)
    onChange({...value,cases,responses}); setSaved(false); setPreview(null); setPasteApplied(false)
  }
  function createField() {
    const name = newField.trim()
    if (!name) {setFieldError('Enter a metadata field name.'); return}
    if (fields.includes(name)) {setFieldError('A metadata field with this name already exists.'); return}
    const cases = value.cases.map(item => ({...item, metadata: replace(item.metadata,name,null)}))
    const responses = value.responses.map(item => ({...item, metadata: replace(item.metadata || [],name,null)}))
    setCreatedFields(items => [...items,name]); setKey(name); setNewField(''); setCreating(false); setFieldError(''); setSaved(false); setPreview(null); setPasteApplied(false)
    onChange({...value,cases,responses})
  }
  function applyPaste() {
    if (!key || !preview?.length || preview.some(row => row.status !== 'Ready')) return
    const assignments = new Map(preview.map(row => [row.caseReference!,row.newValue]))
    const cases = value.cases.map(item => assignments.has(item.id) ? {...item,metadata:replace(item.metadata,key,assignments.get(item.id)!)} : item)
    const responses = value.responses.map(item => assignments.has(item.case_reference) ? {...item,metadata:replace(item.metadata || [],key,assignments.get(item.case_reference)!)} : item)
    onChange({...value,cases,responses}); setSaved(false); setPasteApplied(true)
  }
  return <section aria-label="Case Metadata Editor" className="space-y-3 rounded border p-3">
    <div><h4 className="font-medium">Case Metadata Editor</h4><p className="text-sm">Assign researcher-authored per-case labels. No values are inferred from rules or model output.</p></div>
    <div className="flex flex-wrap gap-2"><label>Metadata field <select aria-label="Case metadata field" value={key} onChange={event=>{setKey(event.target.value);setSaved(false);setPreview(null);setPasteApplied(false)}}><option value="">Select a metadata field</option>{fields.map(item=><option key={item} value={item}>{item}</option>)}</select></label>
      <button type="button" onClick={()=>{setCreating(show=>!show);setFieldError('')}}>+ Create Metadata Field</button>
      <label>Search <input aria-label="Case metadata search" value={search} onChange={event=>setSearch(event.target.value)} placeholder="Case ID or requirement"/></label></div>
    {creating&&<div className="flex flex-wrap gap-2"><label>Field Name <input aria-label="New metadata field name" value={newField} onChange={event=>{setNewField(event.target.value);setFieldError('')}} placeholder="Data Quality Dimension"/></label><button type="button" onClick={createField}>Create</button><button type="button" onClick={()=>{setCreating(false);setNewField('');setFieldError('')}}>Cancel</button></div>}
    {fieldError&&<p role="alert">{fieldError}</p>}
    <div className="flex flex-wrap gap-2"><input aria-label="Bulk metadata value" value={bulk} onChange={event=>setBulk(event.target.value)} placeholder="Arbitrary value"/><button type="button" disabled={!selected.length || !key.trim()} onClick={()=>assign(selected,bulk)}>Assign to selected ({selected.length})</button><button type="button" onClick={()=>setSelected(shown.map(item=>item.id))}>Select filtered</button><button type="button" onClick={()=>setSelected([])}>Clear selection</button></div>
    <section aria-label="Bulk Paste Metadata" className="space-y-2 rounded border p-3"><h5 className="font-medium">Bulk Paste Metadata</h5>
      <textarea aria-label="Bulk paste metadata" value={paste} onChange={event=>{setPaste(event.target.value);setPreview(null);setPasteApplied(false)}} placeholder={'Case ID,Value\n01,Completeness\n02,Completeness\n03,Validity'} rows={5}/>
      <div><button type="button" disabled={!key || !paste.trim()} onClick={()=>{setPreview(parseBulkMetadata(paste,value.cases,key));setPasteApplied(false)}}>Preview Bulk Assignment</button></div>
      {preview&&<><p>{preview.filter(row=>row.status==='Ready').length} valid · {preview.filter(row=>row.status==='Invalid Line'||row.status==='Empty Value').length} invalid · {preview.filter(row=>row.status==='Unknown Case ID').length} unknown · {preview.filter(row=>row.status==='Duplicate Case ID').length} duplicates</p>
        <div className="overflow-x-auto"><table aria-label="Bulk metadata preview"><thead><tr><th>Case ID</th><th>Current Value</th><th>New Value</th><th>Status</th></tr></thead><tbody>{preview.map(row=><tr key={row.line}><td>{row.caseId||`Line ${row.line}`}</td><td>{row.currentValue||'Empty'}</td><td>{row.newValue||'Empty'}</td><td>{row.status}</td></tr>)}</tbody></table></div>
        <button type="button" disabled={!preview.length||preview.some(row=>row.status!=='Ready')} onClick={applyPaste}>Apply Bulk Assignment</button></>}
      {pasteApplied&&<p role="status">Bulk assignment applied to the local editor. Use Save case metadata to confirm.</p>}
    </section>
    <div className="max-h-80 overflow-auto"><table aria-label="Case metadata"><thead><tr><th>Select</th><th>Case ID</th><th>Requirement</th><th>Current value</th></tr></thead><tbody>{shown.map(item=><tr key={item.id}><td><input aria-label={`Select case ${item.case_id}`} type="checkbox" checked={selected.includes(item.id)} onChange={()=>setSelected(old=>old.includes(item.id)?old.filter(id=>id!==item.id):[...old,item.id])}/></td><td>{String(item.case_id)}</td><td>{String(item.requirement ?? '')}</td><td><input aria-label={`Metadata for case ${item.case_id}`} value={valueOf(item.metadata,key)} onChange={event=>assign([item.id],event.target.value)}/></td></tr>)}</tbody></table></div>
    {!shown.length&&<p className="empty-state">No cases match this search.</p>}
    <button type="button" onClick={()=>{setSaved(true);setPasteApplied(false)}}>Save case metadata</button>{saved&&<p role="status">Case metadata saved in this imported research dataset.</p>}
  </section>
}
