import type { ResearchAnalysis } from '../../api/research'

export function MetadataReadiness({data, strategyKey, dimensionKey, variantKey}: {data: ResearchAnalysis; strategyKey: string; dimensionKey: string; variantKey: string}) {
  const readiness=data.metadata_readiness
  const available=(key:string)=>!!key&&data.metadata_keys.includes(key)
  return <section aria-label="Research Metadata Readiness" className="benchmark-panel p-4">
    <h3>Research Metadata Readiness</h3>
    <dl className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
      <div><dt>Prompt Strategy</dt><dd>{available(strategyKey)?`Available (${strategyKey})`:'Missing or not configured'}</dd></div>
      <div><dt>Data Quality Dimension</dt><dd>{available(dimensionKey)?`Available (${dimensionKey})`:'Missing or not configured'}</dd></div>
      <div><dt>Experiment Variant</dt><dd>{available(variantKey)?`Available (${variantKey})`:'Not configured'}</dd></div>
      <div><dt>Matched strategy cases</dt><dd>{readiness?.matched_strategy_cases ?? 0} / {readiness?.total_strategy_cases ?? data.total_unique_cases}</dd></div>
    </dl>
    {!strategyKey&&<p className="mt-2 text-sm">Prompt Strategy analysis is unavailable because no strategy metadata key is configured.</p>}
    {strategyKey&&!available(strategyKey)&&<p className="mt-2 text-sm">Prompt Strategy analysis is unavailable because “{strategyKey}” is absent from this scope.</p>}
    {!dimensionKey&&<p className="text-sm">Data Quality Dimension analysis is unavailable because no quality-dimension metadata key is configured.</p>}
    {dimensionKey&&!available(dimensionKey)&&<p className="text-sm">Data Quality Dimension analysis is unavailable because “{dimensionKey}” is absent from this scope.</p>}
  </section>
}
