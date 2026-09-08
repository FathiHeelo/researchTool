// @vitest-environment jsdom
import { afterEach, expect, test, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { ResearchDashboard } from './ResearchDashboard'
import { evaluationApi, type DashboardSummary } from '../../api/client'

afterEach(() => { cleanup(); vi.restoreAllMocks() })

const summary: DashboardSummary = {
  total_runs: 1,
  total_evaluated_responses: 3,
  total_unique_cases: 2,
  total_models: 2,
  average_overall_accuracy: 83.33,
  reliability: 66.67,
  hallucination_count: 1,
  hallucination_rate: 33.33,
  perfect_results: 1,
  partial_results: 1,
  failed_results: 1,
  error_tag_counts: { UNKNOWN_FUNCTION: 1 },
  most_common_error_tags: [{ error_tag: 'UNKNOWN_FUNCTION', count: 1 }],
  ground_truth_warning_results: 1,
  ground_truth_warning_cases: 1,
  models: [
    { model: 'Research Model A', response_count: 2, average_overall_accuracy: 75, average_component_scores: { custom: 0.75 }, reliability: 50, hallucination_rate: 50 },
    { model: 'Arbitrary Model B', response_count: 1, average_overall_accuracy: 100, average_component_scores: { custom: 1 }, reliability: 100, hallucination_rate: 0 },
  ],
}

test('dashboard renders summary cards dynamic models and error summary', async () => {
  vi.spyOn(evaluationApi, 'list').mockResolvedValue([{ id: 1, status: 'completed', processed_responses: 3, total_responses: 3, summary: {} }])
  vi.spyOn(evaluationApi, 'dashboard').mockResolvedValue(summary)
  render(<ResearchDashboard projectId="1" />)
  expect(await screen.findByText('Responses Evaluated')).toBeTruthy()
  expect(screen.getByText('3')).toBeTruthy()
  const table = screen.getByRole('table', { name: 'Model performance' })
  expect(within(table).getByText('Research Model A')).toBeTruthy()
  expect(within(table).getByText('Arbitrary Model B')).toBeTruthy()
  expect(screen.getByText('UNKNOWN_FUNCTION: 1')).toBeTruthy()
})

test('dashboard run and model filters call API', async () => {
  vi.spyOn(evaluationApi, 'list').mockResolvedValue([{ id: 5, status: 'completed', processed_responses: 1, total_responses: 1, summary: {} }])
  const load = vi.spyOn(evaluationApi, 'dashboard').mockResolvedValue(summary)
  render(<ResearchDashboard projectId="1" />)
  await screen.findByText('Run 5 - completed')
  const runFilter = screen.getByLabelText('Dashboard run filter') as HTMLSelectElement
  fireEvent.change(runFilter, { target: { value: '5' } })
  expect(runFilter.value).toBe('5')
  await waitFor(() => expect(load.mock.calls.at(-1)?.[1]).toContain('run_id=5'))
  fireEvent.change(screen.getByLabelText('Dashboard model filter'), { target: { value: 'Research Model A' } })
  await waitFor(() => expect(load.mock.calls.at(-1)?.[1]).toContain('model=Research+Model+A'))
})

test('dashboard handles empty and error states', async () => {
  vi.spyOn(evaluationApi, 'list').mockResolvedValue([])
  const load = vi.spyOn(evaluationApi, 'dashboard').mockResolvedValue({ ...summary, total_evaluated_responses: 0, total_models: 0, models: [], most_common_error_tags: [] })
  const { rerender } = render(<ResearchDashboard projectId="1" />)
  expect(await screen.findByText('No evaluated responses yet.')).toBeTruthy()
  expect(screen.getByText('No error tags recorded.')).toBeTruthy()
  load.mockRejectedValueOnce(new Error('network'))
  fireEvent.click(screen.getByText('Refresh dashboard'))
  rerender(<ResearchDashboard projectId="1" />)
  expect((await screen.findByRole('alert')).textContent).toContain('Unable to load dashboard summary.')
})
