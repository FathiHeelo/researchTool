const baseUrl = (import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000').replace(/\/+$/, '')
export { baseUrl as apiBaseUrl, request as apiRequest }

export interface Project {
  id: number
  name: string
  description: string | null
  created_at: string
  updated_at: string
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`${baseUrl}${path}`, options)
  if (!response.ok) {
    const error = await response.json().catch(() => null)
    if (Array.isArray(error?.detail)) {
      const messages = error.detail.map((item: {msg?: unknown}) => typeof item?.msg === 'string' ? item.msg : '').filter(Boolean)
      if (messages.length) throw new Error(messages.join('; '))
    }
    throw new Error(typeof error?.detail === 'string' ? error.detail : `Request failed (${response.status}). Please check your input and try again.`)
  }
  return response.status === 204 ? undefined as T : response.json() as Promise<T>
}

export const projectsApi = {
  list: (signal: AbortSignal) => request<Project[]>('/projects', { signal }),
  get: (id: string, signal: AbortSignal) => request<Project>(`/projects/${encodeURIComponent(id)}`, { signal }),
  create: (data: { name: string; description: string | null }) => request<Project>('/projects', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data),
  }),
  delete: (id: number) => request<void>(`/projects/${id}`, { method: 'DELETE' }),
}

export async function checkHealth(signal: AbortSignal): Promise<void> {
  const response = await fetch(`${baseUrl}/health`, { signal })
  if (!response.ok) throw new Error(`Health request failed: ${response.status}`)
  const data: unknown = await response.json()
  if (!data || typeof data !== 'object' || !('status' in data) || data.status !== 'ok') {
    throw new Error('Unexpected health response')
  }
}

export type DatasetValue = string | number | boolean | null
export interface ColumnAssignment { index: number; role: string; label?: string }
export interface NormalizedImport { cases: unknown[]; models: unknown[]; responses: unknown[] }
export interface EvaluationRun { id: number; status: string; processed_responses: number; total_responses: number; failure_summary?: string; summary: Record<string, number | null> }
export interface EvaluationRow { id: number; case_id: string; model: string; overall_accuracy: number | null; scores: Record<string, number | null>; hallucination_detected: boolean; hallucinated_functions: string[]; error_tags: string[]; notes: string[]; snapshot: unknown }
export interface ResultsPage { items: EvaluationRow[]; total: number; models: string[] }
export interface ModelDashboardSummary { model: string; response_count: number; average_overall_accuracy: number | null; average_component_scores: Record<string, number>; reliability: number; hallucination_rate: number }
export interface DashboardSummary {
  filtered_results?: number
  filtered_cases?: number
  total_runs: number
  total_evaluated_responses: number
  total_unique_cases: number
  total_models: number
  average_overall_accuracy: number | null
  reliability: number
  hallucination_count: number
  hallucination_rate: number
  perfect_results: number
  partial_results: number
  failed_results: number
  error_tag_counts: Record<string, number>
  most_common_error_tags: { error_tag: string; count: number }[]
  ground_truth_warning_results: number
  ground_truth_warning_cases: number
  models: ModelDashboardSummary[]
}
export interface GroundTruthWarning { warning_type: string; severity: string; message: string; case_id?: string; expected_rule?: string; requirement?: string; model?: string; result_id?: number }
export interface ReviewDetails extends EvaluationRow { metric_configuration?: {key: string; min_score: number; max_score: number}[]; accepted_overall_accuracy?: number | null; automated_scores: Record<string, number | null>; override_scores: Record<string, number>; accepted_scores: Record<string, number | null>; review_note: string; audit_history: unknown[]; ground_truth_warnings: GroundTruthWarning[]; ground_truth_warning: boolean }
export const reviewApi = {
  get: (project: string, run: number, result: number) => request<ReviewDetails>(`/projects/${project}/runs/${run}/results/${result}/review`),
  save: (project: string, run: number, result: number, data: unknown) => request<ReviewDetails>(`/projects/${project}/runs/${run}/results/${result}/review`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) }),
  warnings: (project: string, run: number) => request<GroundTruthWarning[]>(`/projects/${project}/runs/${run}/ground-truth-warnings`),
}
export const evaluationApi = {
  run: (project: string, data: NormalizedImport, protocol?: {protocol_id?: number; protocol_version?: number; use_study_default?: boolean;mode?:'FULL'|'CHANGED_ONLY';baseline_run_id?:number}) => request<EvaluationRun>(`/projects/${project}/runs`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({...data, ...protocol}) }),
  list: (project: string, signal: AbortSignal) => request<EvaluationRun[]>(`/projects/${project}/runs`, { signal }),
  results: (project: string, run: number, query: string, signal: AbortSignal) => request<ResultsPage>(`/projects/${project}/runs/${run}/results?${query}`, { signal }),
  dashboard: (project: string, query: string, signal: AbortSignal) => request<DashboardSummary>(`/projects/${project}/runs/dashboard/summary${query ? `?${query}` : ''}`, { signal }),
}
export async function importDataset(file: File, assignments: ColumnAssignment[], signal: AbortSignal, sheetName?: string): Promise<NormalizedImport> {
  const body = new FormData()
  body.append('file', file)
  body.append('mapping', JSON.stringify({ assignments }))
  if (sheetName !== undefined) body.append('sheet_name', sheetName)
  const response = await fetch(`${baseUrl}/datasets/import`, { method: 'POST', body, signal })
  const data = await response.json()
  if (!response.ok) throw new Error(typeof data.detail === 'string' ? data.detail : 'Import failed. Check the mapping.')
  return data
}
export interface XLSXPreviewRow { row_index: number; values: DatasetValue[] }

export interface DatasetMetadata {
  filename: string
  extension: string
  size: number
  total_row_count?: number
  column_count?: number
  sheet_count?: number
  sheet_names?: string[]
  selected_sheet?: string
  columns?: (string | number | boolean | null)[]
  inferred_data_types?: string[] | Record<string, string>
  preview_rows?: XLSXPreviewRow[] | Record<string, DatasetValue>[]
}

export async function uploadDataset(file: File, signal: AbortSignal, sheetName?: string): Promise<DatasetMetadata> {
  const body = new FormData()
  body.append('file', file)
  if (sheetName !== undefined) body.append('sheet_name', sheetName)
  let response: Response
  try {
    response = await fetch(`${baseUrl}/datasets/upload`, { method: 'POST', body, signal })
  } catch {
    throw new Error('Unable to reach the backend. Check your connection and try again.')
  }
  if (!response.ok) {
    const error: unknown = await response.json().catch(() => null)
    if (response.status < 500 && error && typeof error === 'object' && 'detail' in error && typeof error.detail === 'string') {
      throw new Error(error.detail)
    }
    throw new Error(response.status === 422 ? 'Please provide a valid file.' : 'Upload failed. Please try again.')
  }
  const data: unknown = await response.json().catch(() => null)
  const invalid = () => new Error('The backend returned an invalid dataset response. Please try again.')
  if (!data || typeof data !== 'object') throw invalid()
  const metadata = data as DatasetMetadata
  const count = (value: unknown) => typeof value === 'number' && Number.isInteger(value) && value >= 0
  if (typeof metadata.filename !== 'string' || typeof metadata.extension !== 'string' || !count(metadata.size)) throw invalid()
  if (/\.xlsx$/i.test(file.name)) {
    if (!Array.isArray(metadata.sheet_names) || !metadata.sheet_names.every(name => typeof name === 'string') || metadata.sheet_count !== metadata.sheet_names.length) throw invalid()
    if (sheetName !== undefined && (metadata.selected_sheet !== sheetName || !metadata.sheet_names.includes(sheetName) || !count(metadata.total_row_count) || !count(metadata.column_count) || !Array.isArray(metadata.columns) || metadata.columns.length !== metadata.column_count || !metadata.columns.every(column => column === null || ['string', 'number', 'boolean'].includes(typeof column)))) throw invalid()
    if (sheetName !== undefined && (!Array.isArray(metadata.inferred_data_types) || metadata.inferred_data_types.length !== metadata.column_count || !metadata.inferred_data_types.every(type => typeof type === 'string' && type.length > 0))) throw invalid()
  }
  if (metadata.preview_rows !== undefined) {
    const scalar = (value: unknown) => value === null || typeof value === 'string' || typeof value === 'boolean' || (typeof value === 'number' && Number.isFinite(value))
    if (!Array.isArray(metadata.columns) || !Array.isArray(metadata.preview_rows)) throw invalid()
    for (const row of metadata.preview_rows) {
      if (!row || typeof row !== 'object' || Array.isArray(row)) throw invalid()
      if (sheetName !== undefined) {
        if (!('row_index' in row) || !count(row.row_index) || !Array.isArray(row.values) || row.values.length !== metadata.columns.length || !row.values.every(scalar)) throw invalid()
      } else if (!Object.values(row).every(scalar)) throw invalid()
    }
  }
  return metadata
}
