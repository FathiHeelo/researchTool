import { apiRequest, apiBaseUrl } from './client'
export interface MetricConfiguration {
  key: string; name: string; description: string; enabled: boolean; weight: number;
  score_type: string; min_score: number; max_score: number; allowed_values: number[] | null;
  evaluation_mode: string; display_order: number
}
export type ResearchRecord = Record<string, unknown>
export interface ResearchAnalysis {
  response_count: number; total_unique_cases: number; total_models: number;
  average_overall_accuracy: number | null; reliability: number | null; hallucination_rate: number;
  metadata_keys: string[]; models: ResearchRecord[]; strategies: ResearchRecord[]; strategy_deltas: ResearchRecord[];
  dimensions: ResearchRecord[]; dimension_summary: ResearchRecord[]; groups: ResearchRecord[];
  agreement: ResearchRecord[]; agreement_summary?: ResearchRecord[]; errors: ResearchRecord[]; hallucinated_functions: Record<string, number>;
  ground_truth_warning_results: number; filtered_results: number; filtered_cases: number;
  include_ground_truth_warnings: boolean
}
export const researchApi = {
  analyst: (project: string, query: string, signal?: AbortSignal) => apiRequest<AnalystSummary>(`/projects/${project}/runs/dashboard/analyst-summary?${query}`, {signal}),
  metrics: (project: string, signal?: AbortSignal) => apiRequest<{metrics: MetricConfiguration[]}>(`/projects/${project}/runs/settings/metrics`, {signal}),
  saveMetrics: (project: string, metrics: MetricConfiguration[]) => apiRequest<{metrics: MetricConfiguration[]}>(`/projects/${project}/runs/settings/metrics`, {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({metrics})}),
  resetMetrics: (project: string) => apiRequest<{metrics: MetricConfiguration[]}>(`/projects/${project}/runs/settings/metrics/reset`, {method: 'POST'}),
  analysis: (project: string, query: string, signal?: AbortSignal) => apiRequest<ResearchAnalysis>(`/projects/${project}/runs/dashboard/research?${query}`, {signal}),
  export: async (project: string, run: string, query: string) => {
    const response = await fetch(`${apiBaseUrl}/projects/${project}/runs/${run}/export?${query}`)
    if (!response.ok) throw new Error('Export failed. Please retry.')
    return response.blob()
  },
}

export interface AnalystFinding {
  finding_type: string; title: string; text: string; supporting_metric: string;
  value: number | string | null; evidence_count: number; comparison_value?: number;
  model?: string; metadata_context?: Record<string, unknown>
}
export const analystSections = {
  overview: 'Executive Overview', model_findings: 'Model Comparison', strategy_findings: 'Prompt Strategy Insights',
  dimension_findings: 'Data Quality Dimension Insights', reliability_findings: 'Reliability',
  hallucination_findings: 'Hallucinations', agreement_findings: 'Agreement', error_findings: 'Error Patterns',
  ground_truth_notes: 'Ground Truth Notes', limitations: 'Limitations',
} as const
export type AnalystSummary = {scope: Record<string, unknown>} & Record<keyof typeof analystSections, AnalystFinding[]>
