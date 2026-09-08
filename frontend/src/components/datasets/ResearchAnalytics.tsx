import { ReportActions } from './ReportPrimitives'
import { useEffect, useState } from 'react'
import { evaluationApi, type EvaluationRun } from '../../api/client'
import { researchApi, type ResearchAnalysis, type ResearchRecord } from '../../api/research'
import { MetricsSettings } from './MetricsSettings'
import { GroundTruthWarnings } from './GroundTruthWarnings'
import { ResearchSummary } from './ResearchSummary'
import { VariantComparison, StatisticalComparison } from './ExperimentComparisons'
import { EvaluationProtocols } from './EvaluationProtocols'
import type { StatisticalSettings, ProtocolConfiguration } from '../../api/experiments'
import {InterRaterReview} from './InterRaterReview'
import {ReplicationPackage} from './ReplicationPackage'

function value(input: unknown): string {
  if (input === null || input === undefined) return 'Not Available'
  if (typeof input === 'number') return Number.isInteger(input) ? String(input) : input.toFixed(2)
  return typeof input === 'object' ? JSON.stringify(input) : String(input)
}
export function ResearchTable({title, rows, empty = 'No data available'}: {title: string; rows: ResearchRecord[]; empty?: string}) {
  const keys = [...new Set(rows.flatMap(row => Object.keys(row)))]
  return <section className="space-y-2"><h3 className="font-medium">{title}</h3>{!rows.length ? <p>{empty}</p> : <div className="overflow-x-auto"><table aria-label={title} className="w-full text-left text-sm"><thead><tr>{keys.map(k => <th className="p-2" key={k}>{k.replaceAll('_', ' ')}</th>)}</tr></thead><tbody>{rows.map((r, i) => <tr className="border-t" key={i}>{keys.map(k => <td className="max-w-sm break-words p-2" key={k}>{value(r[k])}</td>)}</tr>)}</tbody></table></div>}</section>
}
export function ResearchAnalytics({projectId, initialTab, selectedRunId, onRunChange}: {projectId: string; initialTab?: string; selectedRunId?: string; onRunChange?: (id:string)=>void}) {
  const [runs, setRuns] = useState<EvaluationRun[]>([])
  const [run, setRun] = useState(selectedRunId || '')
  useEffect(()=>{if(selectedRunId!==undefined)setRun(selectedRunId)},[selectedRunId])
  const [model, setModel] = useState('')
  const [strategy, setStrategy] = useState('')
  const [dimension, setDimension] = useState('')
  const [group, setGroup] = useState('')
  const [included, setIncluded] = useState(true)
  const [data, setData] = useState<ResearchAnalysis | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [reload, setReload] = useState(0)
  const [tab, setTab] = useState(initialTab || 'Overview')
  useEffect(()=>{if(initialTab)setTab(initialTab)},[initialTab])
  const [exporting, setExporting] = useState(false)
  const [exportStatus, setExportStatus] = useState('')
  const [exportError, setExportError] = useState('')
  const [format, setFormat] = useState('xlsx')
  const [keys, setKeys] = useState<string[]>([])
  const [models, setModels] = useState<string[]>([])
  const [variant,setVariant] = useState('')
  const [statistics,setStatistics] = useState<StatisticalSettings>({enabled:false,alpha:.05,correction:'holm'})
  function applyRunProtocol() {
    const saved = runs.find(r=>String(r.id)===run)?.summary as unknown as {protocol_snapshot?:{configuration:ProtocolConfiguration}} | undefined
    const c=saved?.protocol_snapshot?.configuration
    if(c){setIncluded(c.include_ground_truth_warnings);setVariant(c.variant_metadata_key||'');setStrategy(c.analysis_metadata_keys.strategy||'');setDimension(c.analysis_metadata_keys.dimension||'');setGroup(c.analysis_metadata_keys.group||'');setStatistics(c.statistics)}
  }
  useEffect(() => {
    const c = new AbortController()
    evaluationApi.list(projectId, c.signal).then(r => {if (!c.signal.aborted) setRuns(r)}).catch(() => {if (!c.signal.aborted) setError('Unable to load runs.')})
    return () => c.abort()
  }, [projectId, reload])
  useEffect(() => {
    const c = new AbortController()
    setData(null); setError(''); setBusy(true); setExportStatus(''); setExportError('')
    const query = new URLSearchParams({include_ground_truth_warnings: String(included)})
    if (run) query.set('run_id', run)
    if (model) query.set('model', model)
    if (strategy) query.set('strategy_key', strategy)
    if (dimension) query.set('dimension_key', dimension)
    if (group) query.set('group_key', group)
    researchApi.analysis(projectId, query.toString(), c.signal).then(d => {
      if (!c.signal.aborted) {setData(d); setKeys(old => [...new Set([...old, ...d.metadata_keys])]); if (!model) setModels(d.models.map(m => String(m.model)))}
    }).catch(() => {if (!c.signal.aborted) setError('Unable to load research analytics. Please retry.')})
      .finally(() => {if (!c.signal.aborted) setBusy(false)})
    return () => c.abort()
  }, [projectId, run, model, strategy, dimension, group, included, reload])
  async function download() {
    if (!run || exporting) return
    setExporting(true); setExportStatus(''); setExportError('')
    try {
      const query = new URLSearchParams({format, include_ground_truth_warnings: String(included)})
      if (strategy) query.set('strategy_key', strategy)
      if (dimension) query.set('dimension_key', dimension)
      const blob = await researchApi.export(projectId, run, query.toString())
      const url = URL.createObjectURL(blob), a = document.createElement('a')
      a.href = url; a.download = `run-${run}.${format}`; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000)
      setExportStatus('Export downloaded.')
    } catch {setExportError('Unable to export. Please retry.')} finally {setExporting(false)}
  }
  return <section className="analysis-screen space-y-4"><div className="screen-heading"><h1>{["Agreement","Statistical Comparison"].includes(tab)?"Statistical Significance & Model Agreement":"Research Analysis & Export"}</h1><p>Matched-case comparisons, model agreement, and accepted-score research evidence.</p></div>
    <div className="flex flex-wrap gap-3"><select aria-label="Research run" value={run} disabled={exporting} onChange={e => {setRun(e.target.value);onRunChange?.(e.target.value)}}><option value="">All runs</option>{runs.map(r => <option key={r.id} value={r.id}>Run {r.id}</option>)}</select>
      <select aria-label="Research model" value={model} onChange={e => setModel(e.target.value)}><option value="">All models</option>{models.map(m => <option key={m}>{m}</option>)}</select>
      <label><input type="checkbox" disabled={exporting} checked={included} onChange={e => setIncluded(e.target.checked)}/> Include ground-truth warnings</label><button onClick={() => setReload(n => n+1)}>Refresh analysis</button></div>
    <ReportActions projectId={projectId} run={runs.find(r=>String(r.id)===run)}/>
    <p>Flagged ground-truth cases: {included ? 'Included' : 'Excluded'}. {data ? `${data.filtered_results} responses / ${data.filtered_cases} cases filtered.` : ''}</p>
    <button disabled={!run} onClick={applyRunProtocol}>Use selected run’s protocol analysis settings</button>
    <label className="block">Experiment Variant <select aria-label="Experiment Variant metadata" value={variant} onChange={e=>setVariant(e.target.value)}><option value="">Choose metadata key</option>{keys.map(k=><option key={k}>{k}</option>)}</select></label>
    <div className="flex flex-wrap gap-3">{([['Strategy metadata', strategy, setStrategy], ['Quality-dimension metadata', dimension, setDimension], ['Group metadata', group, setGroup]] as const).map(([label, selected, setter]) => <label key={label}>{label} <select aria-label={label} value={selected} onChange={e => setter(e.target.value)}><option value="">Choose metadata key</option>{keys.map(k => <option key={k}>{k}</option>)}</select></label>)}</div>
    <nav className="flex flex-wrap gap-3" aria-label="Research sections">{['Overview', 'Research Summary', 'Variant Comparison', 'Statistical Comparison', 'Evaluation Protocols', 'Inter-Rater Review', 'Replication Package', 'Model Performance', 'Prompt Strategies', 'Data Quality Dimensions', 'Agreement', 'Errors', 'Ground Truth', 'Metadata', 'Metrics', 'Export'].map(t => <button aria-pressed={tab === t} className={tab === t ? 'font-bold underline' : ''} key={t} onClick={() => setTab(t)}>{t}</button>)}</nav>
    {tab==='Inter-Rater Review'&&<InterRaterReview key={`${projectId}-${run}-${reload}`} projectId={projectId} run={run}/>}
    {tab==='Replication Package'&&<ReplicationPackage key={`${projectId}-${run}`} projectId={projectId} run={run} included={included}/>}
    {tab === 'Research Summary' && <ResearchSummary key={`${projectId}-${reload}`} projectId={projectId} query={new URLSearchParams({include_ground_truth_warnings: String(included), ...(run ? {run_id: run} : {}), ...(model ? {model} : {}), ...(strategy ? {strategy_key: strategy} : {}), ...(dimension ? {dimension_key: dimension} : {}), ...(variant ? {variant_key:variant} : {})}).toString()}/>}
    {tab==='Variant Comparison'&&<VariantComparison key={`${projectId}-${reload}`} projectId={projectId} query={new URLSearchParams({include_ground_truth_warnings:String(included),...(run?{run_id:run}:{}),...(model?{model}:{}),...(variant?{metadata_key:variant}:{})}).toString()}/>}
    {tab==='Statistical Comparison'&&<StatisticalComparison key={`${projectId}-${reload}`} projectId={projectId} run={run} model={model} strategyKey={strategy} variantKey={variant} included={included} settings={statistics} onSettings={setStatistics}/>}
    {tab==='Evaluation Protocols'&&<EvaluationProtocols projectId={projectId} analysisKeys={Object.fromEntries([['strategy',strategy],['dimension',dimension],['group',group]].filter(([,v])=>v))} variantKey={variant} included={included} statistics={statistics}/>}
    {busy && <p role="status">Loading research analysis…</p>}{error && <p role="alert">{error}</p>}
    {data && tab === 'Overview' && <><ResearchTable title="Research Overview" rows={[{Responses: data.response_count, Cases: data.total_unique_cases, Models: data.total_models, 'Overall Accuracy (%)': data.average_overall_accuracy, 'Reliability (%)': data.reliability, 'Hallucination Rate (%)': data.hallucination_rate, 'Ground Truth Warnings': data.ground_truth_warning_results}]}/>{!data.response_count && <p>No evaluated responses in this scope.</p>}</>}
    {data && tab === 'Model Performance' && <ResearchTable title="Model ranking and accepted components" rows={data.models}/>}
    {data && tab === 'Prompt Strategies' && <><ResearchTable title="Prompt strategy performance" rows={data.strategies} empty="No strategy metadata available"/><ResearchTable title="Matched-case accuracy deltas" rows={data.strategy_deltas}/></>}
    {data && tab === 'Data Quality Dimensions' && <><ResearchTable title="Model × Dimension" rows={data.dimensions} empty="No quality-dimension metadata available"/><ResearchTable title="Global dimension summary" rows={data.dimension_summary}/></>}
    {data && tab === 'Agreement' && <><p>Normalized expectation-function sets; invalid or ambiguous outputs are not agreements. Rates are percentages.</p><AgreementMatrix rows={data.agreement}/><ResearchTable title="Pairwise agreement counts" rows={data.agreement}/><ResearchTable title="Agreement by strategy" rows={data.agreement_summary || []}/></>}
    {data && tab === 'Errors' && <><p>Multiple error tags may apply to one response; percentages need not sum to 100%.</p><ResearchTable title="Error occurrence" rows={data.errors}/><ResearchTable title="Hallucinated functions" rows={Object.entries(data.hallucinated_functions).map(([name, count]) => ({name, count}))}/></>}
    {tab === 'Ground Truth' && (run ? <GroundTruthWarnings key={run} projectId={projectId} runId={Number(run)}/> : <p>Choose a run to inspect ground-truth warnings.</p>)}
    {data && tab === 'Metadata' && <ResearchTable title="Model × Metadata" rows={data.groups}/>}
    {tab === 'Metrics' && <MetricsSettings projectId={projectId}/>}
    {tab === 'Export' && <div className="space-y-3"><p>Choose a run above. Export includes all models in that run and the ground-truth inclusion setting.</p><select aria-label="Export format" value={format} disabled={exporting} onChange={e => setFormat(e.target.value)}><option value="xlsx">XLSX</option><option value="csv">CSV</option></select><button disabled={!run || exporting} onClick={() => void download()}>{exporting ? 'Exporting…' : 'Download results'}</button>{exportStatus && <p role="status">{exportStatus}</p>}{exportError && <p role="alert">{exportError}</p>}</div>}
  </section>
}

function AgreementMatrix({rows}: {rows: ResearchRecord[]}) {
  const strategies = [...new Set(rows.map(r => r.strategy))]
  return <>{strategies.map((strategy, i) => {
    const scoped = rows.filter(r => r.strategy === strategy)
    const names = [...new Set(scoped.flatMap(r => [String(r.model_a), String(r.model_b)]))].sort()
    return <section key={i}><h3>Agreement matrix — {value(strategy ?? 'All strategies')}</h3><div className="overflow-x-auto"><table className="agreement-matrix w-full text-sm text-left"><thead><tr><th>Model</th>{names.map(n => <th key={n}>{n}</th>)}</tr></thead><tbody>{names.map(a => <tr key={a}><th>{a}</th>{names.map(b => <td className="p-2" key={b}>{a === b ? '—' : value(scoped.find(r => (r.model_a === a && r.model_b === b) || (r.model_a === b && r.model_b === a))?.agreement_rate)}</td>)}</tr>)}</tbody></table></div></section>
  })}</>
}
