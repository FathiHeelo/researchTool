// @vitest-environment jsdom
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { evaluationApi } from '../../api/client'
import { researchApi, type ResearchAnalysis, type MetricConfiguration } from '../../api/research'
import { ResearchAnalytics } from './ResearchAnalytics'
import { MetricsSettings } from './MetricsSettings'

const analysis: ResearchAnalysis = {
  response_count: 2, total_unique_cases: 1, total_models: 2, average_overall_accuracy: 87.5,
  reliability: 100, hallucination_rate: 0, metadata_keys: ['Experiment', 'Custom Dimension'],
  models: [{model: 'Novel Ω', response_count: 1, average_overall_accuracy: 87.5}],
  strategies: [{model: 'Novel Ω', value: 'Strategy Z', response_count: 1}], strategy_deltas: [],
  dimensions: [], dimension_summary: [], groups: [], agreement: [], errors: [{tag: 'Arbitrary Tag', count: 1, percentage: 50}],
  hallucinated_functions: {}, ground_truth_warning_results: 1, filtered_results: 0, filtered_cases: 0,
  include_ground_truth_warnings: true,
}
const metric: MetricConfiguration = {key: 'novel', name: 'Novel Metric', description: '', enabled: true, weight: 1,
  min_score: 0, max_score: 10, score_type: 'number', allowed_values: null, evaluation_mode: 'manual', display_order: 0}
beforeEach(() => {
  vi.spyOn(evaluationApi, 'list').mockResolvedValue([{id: 1, status: 'completed', processed_responses: 2, total_responses: 2, summary: {}}])
  vi.spyOn(researchApi, 'analysis').mockResolvedValue(analysis)
})
afterEach(() => {cleanup(); vi.restoreAllMocks()})

test('overview dynamic models errors and optional metadata states', async () => {
  render(<ResearchAnalytics projectId="1" />)
  expect(await screen.findByText('87.50')).toBeTruthy()
  fireEvent.click(screen.getByRole('button', {name: 'Model Performance'}))
  expect(within(screen.getByRole('table')).getByText('Novel Ω')).toBeTruthy()
  fireEvent.click(screen.getByRole('button', {name: 'Errors'}))
  expect(screen.getByText('Arbitrary Tag')).toBeTruthy()
  fireEvent.click(screen.getByRole('button', {name: 'Data Quality Dimensions'}))
  expect(screen.getByText('No quality-dimension metadata available')).toBeTruthy()
})

test('run metadata and ground truth filters replace stale analysis', async () => {
  render(<ResearchAnalytics projectId="1" />)
  await screen.findByText('87.50')
  vi.mocked(researchApi.analysis).mockImplementationOnce(() => new Promise(() => {}))
  fireEvent.change(screen.getByLabelText('Research run'), {target: {value: '1'}})
  expect(screen.queryByText('87.50')).toBeNull()
  expect(screen.getByRole('status').textContent).toContain('Loading')
  vi.mocked(researchApi.analysis).mockResolvedValue({...analysis, filtered_results: 1, filtered_cases: 1, include_ground_truth_warnings: false})
  fireEvent.click(screen.getByLabelText('Include ground-truth warnings'))
  await waitFor(() => expect(researchApi.analysis).toHaveBeenLastCalledWith('1', expect.stringContaining('include_ground_truth_warnings=false'), expect.any(AbortSignal)))
  expect(await screen.findByText(/1 responses \/ 1 cases filtered/)).toBeTruthy()
  fireEvent.change(screen.getByLabelText('Strategy metadata'), {target: {value: 'Experiment'}})
  await waitFor(() => expect(researchApi.analysis).toHaveBeenLastCalledWith('1', expect.stringContaining('strategy_key=Experiment'), expect.any(AbortSignal)))
})

test('network error supports refresh retry and empty scope', async () => {
  vi.mocked(researchApi.analysis).mockRejectedValueOnce(new Error('offline'))
  render(<ResearchAnalytics projectId="1" />)
  expect((await screen.findByRole('alert')).textContent).toContain('Unable to load')
  vi.mocked(researchApi.analysis).mockResolvedValue({...analysis, response_count: 0})
  fireEvent.click(screen.getByRole('button', {name: 'Refresh analysis'}))
  expect(await screen.findByText('No evaluated responses in this scope.')).toBeTruthy()
})

test('metrics save preserves arbitrary keys scales and reset', async () => {
  vi.spyOn(researchApi, 'metrics').mockResolvedValue({metrics: [metric]})
  const save = vi.spyOn(researchApi, 'saveMetrics').mockResolvedValue({metrics: [{...metric, weight: 9}]})
  const reset = vi.spyOn(researchApi, 'resetMetrics').mockResolvedValue({metrics: [metric]})
  render(<MetricsSettings projectId="1" />)
  await screen.findByText('Novel Metric')
  fireEvent.change(screen.getByLabelText('Weight novel'), {target: {value: '9'}})
  fireEvent.click(screen.getByRole('button', {name: 'Save configuration'}))
  await waitFor(() => expect(save).toHaveBeenCalledWith('1', [expect.objectContaining({key: 'novel', weight: 9, max_score: 10})]))
  await screen.findByText(/Saved. Future/)
  fireEvent.click(screen.getByRole('button', {name: 'Reset defaults'}))
  await waitFor(() => expect(reset).toHaveBeenCalled())
})

test('metrics backend validation is readable', async () => {
  vi.spyOn(researchApi, 'metrics').mockResolvedValue({metrics: [metric]})
  vi.spyOn(researchApi, 'saveMetrics').mockRejectedValue(new Error('Enable at least one metric'))
  render(<MetricsSettings projectId="1" />)
  await screen.findByText('Novel Metric')
  fireEvent.click(screen.getByRole('button', {name: 'Save configuration'}))
  expect((await screen.findByRole('alert')).textContent).toContain('Enable at least one metric')
})

test('export requires run prevents duplicates and handles failure retry', async () => {
  const exporting = vi.spyOn(researchApi, 'export').mockRejectedValueOnce(new Error('failure'))
  render(<ResearchAnalytics projectId="1" />)
  await screen.findByText('87.50')
  fireEvent.click(screen.getByRole('button', {name: 'Export'}))
  expect((screen.getByRole('button', {name: 'Download results'}) as HTMLButtonElement).disabled).toBe(true)
  fireEvent.change(screen.getByLabelText('Research run'), {target: {value: '1'}})
  fireEvent.click(screen.getByRole('button', {name: 'Download results'}))
  expect((await screen.findByRole('alert')).textContent).toContain('Unable to export')
  exporting.mockImplementation(() => new Promise(() => {}))
  fireEvent.click(screen.getByRole('button', {name: 'Download results'}))
  expect((screen.getByRole('button', {name: 'Exporting…'}) as HTMLButtonElement).disabled).toBe(true)
  expect(exporting).toHaveBeenCalledTimes(2)
})

test('export downloads selected format with ground-truth setting', async () => {
  const blob = new Blob(['research'], {type: 'text/csv'})
  const download = vi.spyOn(researchApi, 'export').mockResolvedValue(blob)
  const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
  const original = URL.createObjectURL
  URL.createObjectURL = vi.fn(() => 'blob:research')
  const originalRevoke = URL.revokeObjectURL
  URL.revokeObjectURL = vi.fn()
  try {
    render(<ResearchAnalytics projectId="1" />)
    await screen.findByText('87.50')
    fireEvent.change(screen.getByLabelText('Research run'), {target: {value: '1'}})
    fireEvent.click(screen.getByLabelText('Include ground-truth warnings'))
    fireEvent.click(screen.getByRole('button', {name: 'Export'}))
    fireEvent.change(screen.getByLabelText('Export format'), {target: {value: 'csv'}})
    fireEvent.click(screen.getByRole('button', {name: 'Download results'}))
    expect(await screen.findByText('Export downloaded.')).toBeTruthy()
    expect(download).toHaveBeenCalledWith('1', '1', expect.stringContaining('format=csv&include_ground_truth_warnings=false'))
    expect(click).toHaveBeenCalledOnce()
    await new Promise(resolve => setTimeout(resolve, 1050))
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:research')
  } finally {URL.createObjectURL = original; URL.revokeObjectURL = originalRevoke}
})
