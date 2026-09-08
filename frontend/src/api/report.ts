import { apiRequest, evaluationApi, projectsApi, type EvaluationRun, type ReviewDetails } from './client'
import { researchApi, type MetricConfiguration } from './research'
import type { ProtocolConfiguration } from './experiments'

export type ReportRun = Omit<EvaluationRun, 'summary'> & { summary: Record<string, unknown> & {
  evaluator_version?: string; metric_configuration?: MetricConfiguration[];
  protocol_snapshot?: {name: string; protocol_version: number; configuration: ProtocolConfiguration}
} }

export async function loadReport(projectId: string, runId: string, signal: AbortSignal, progress: (n: number, total: number) => void) {
  const prefix = `/projects/${encodeURIComponent(projectId)}/runs/${encodeURIComponent(runId)}`
  const [project, run] = await Promise.all([projectsApi.get(projectId, signal), apiRequest<ReportRun>(prefix, {signal})])
  if (!['completed','completed_with_errors'].includes(run.status)) throw new Error('A completed run is required for a full report.')
  const config = run.summary.protocol_snapshot?.configuration
  const included = config?.include_ground_truth_warnings ?? true
  const query = new URLSearchParams({run_id: runId, include_ground_truth_warnings: String(included)})
  for (const [role,key] of Object.entries(config?.analysis_metadata_keys ?? {})) {
    if (['strategy','dimension','group'].includes(role) && key) query.set(`${role}_key`,key)
  }
  const [dashboard, analysis, analyst] = await Promise.all([
    evaluationApi.dashboard(projectId,query.toString(),signal), researchApi.analysis(projectId,query.toString(),signal), researchApi.analyst(projectId,query.toString(),signal),
  ])
  const details: ReviewDetails[] = []
  let page = 1, total = 0
  do {
    signal.throwIfAborted()
    const result = await evaluationApi.results(projectId,Number(runId),`page=${page}&page_size=100&sort=id`,signal)
    total = result.total
    if (!result.items.length && details.length < total) throw new Error('The result list changed. Reload the report.')
    // Bound parallel requests; preserve server result order and never truncate the appendix.
    for (let i=0; i<result.items.length; i+=4) {
      signal.throwIfAborted()
      const batch = await Promise.all(result.items.slice(i,i+4).map(item => apiRequest<ReviewDetails>(`${prefix}/results/${item.id}/review`,{signal})))
      details.push(...batch); progress(details.length,total)
    }
    page++
  } while (details.length < total)
  if (details.length !== run.processed_responses) throw new Error('Saved result count differs from the run counter. Reload before printing.')
  return {project,run,dashboard,analysis,analyst,included,details,generated: new Date().toISOString()}
}
export type ReportData = Awaited<ReturnType<typeof loadReport>>
