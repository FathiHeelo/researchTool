export interface ConstantMetadataDraft { id: number; key: string; value: string }

export function ResearchMetadataFields({promptStrategy, onPromptStrategy, items, onItems, disabled}: {
  promptStrategy: string; onPromptStrategy: (value: string) => void;
  items: ConstantMetadataDraft[]; onItems: (items: ConstantMetadataDraft[]) => void; disabled: boolean
}) {
  return <section aria-label="Research Metadata" className="space-y-3 rounded border p-3">
    <div><h4 className="font-medium">Research Metadata for this dataset</h4><p className="text-sm text-slate-600">Constant values are copied to every imported case and model response. Keys and values are researcher-defined.</p></div>
    <label className="block">Prompt Strategy (optional)
      <input aria-label="Prompt Strategy" placeholder="e.g. Few-shot" value={promptStrategy} disabled={disabled} onChange={event => onPromptStrategy(event.target.value)} className="ml-2 border p-2" />
    </label>
    {items.map(item => <div className="flex flex-wrap gap-2" key={item.id}>
      <input aria-label={`Metadata key ${item.id}`} placeholder="Metadata key" value={item.key} disabled={disabled} onChange={event => onItems(items.map(current => current.id === item.id ? {...current, key: event.target.value} : current))}/>
      <input aria-label={`Metadata value ${item.id}`} placeholder="Metadata value" value={item.value} disabled={disabled} onChange={event => onItems(items.map(current => current.id === item.id ? {...current, value: event.target.value} : current))}/>
      <button type="button" disabled={disabled} onClick={() => onItems(items.filter(current => current.id !== item.id))}>Remove metadata</button>
    </div>)}
    <button type="button" disabled={disabled} onClick={() => onItems([...items, {id: Math.max(0, ...items.map(item => item.id)) + 1, key: '', value: ''}])}>+ Add Metadata</button>
  </section>
}
