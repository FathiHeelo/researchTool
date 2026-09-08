import { apiRequest, type NormalizedImport } from './client'
import type { MetricConfiguration, ResearchRecord } from './research'

export interface StatisticalSettings {enabled: boolean; alpha: number; correction: 'none' | 'holm'}
export interface ProtocolConfiguration {
  metrics: MetricConfiguration[]; include_ground_truth_warnings: boolean;
  analysis_metadata_keys: Record<string, string>; variant_metadata_key: string | null;
  statistics: StatisticalSettings; evaluator_version: string
}
export interface Protocol {id: number; name: string; description: string; version: number; configuration: ProtocolConfiguration}
export interface VariantResult {metadata_key: string | null; variants: string[]; summaries: ResearchRecord[]; comparisons: ResearchRecord[]; status: string; reason: string | null}
export interface StatisticsResult {groups: string[]; comparisons: ResearchRecord[]; status: string; family_size: number; notes: string[]; correction: string}
export const experimentApi = {
  variants: (project: string, query: string, signal?: AbortSignal) => apiRequest<VariantResult>(`/projects/${project}/runs/dashboard/variants?${query}`, {signal}),
  statistics: (project: string, query: string, signal?: AbortSignal) => apiRequest<StatisticsResult>(`/projects/${project}/runs/dashboard/statistics?${query}`, {signal}),
}
export const protocolApi = {
  list: (project: string, signal?: AbortSignal) => apiRequest<Protocol[]>(`/projects/${project}/protocols`, {signal}),
  defaults: (project: string) => apiRequest<{configuration: ProtocolConfiguration}>(`/projects/${project}/protocols/defaults`),
  save: (project: string, data: {name: string; description: string; configuration: ProtocolConfiguration; expected_version?: number}, id?: number) => apiRequest<Protocol>(`/projects/${project}/protocols${id ? `/${id}` : ''}`, {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(data)}),
  duplicate: (project: string, id: number) => apiRequest<Protocol>(`/projects/${project}/protocols/${id}/duplicate`, {method: 'POST'}),
  delete: (project: string, id: number) => apiRequest<void>(`/projects/${project}/protocols/${id}`, {method: 'DELETE'}),
}
export type ProtocolSelection = Pick<NormalizedImport & {protocol_id?: number; protocol_version?: number; use_study_default?: boolean}, 'protocol_id' | 'protocol_version' | 'use_study_default'>
