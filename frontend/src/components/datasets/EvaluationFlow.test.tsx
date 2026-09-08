// @vitest-environment jsdom
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { RunEvaluation } from './RunEvaluation'
import { ResultsExplorer } from './ResultsExplorer'
import { evaluationApi } from '../../api/client'
import { protocolApi } from '../../api/experiments'

afterEach(() => { cleanup(); vi.restoreAllMocks() })
beforeEach(() => {vi.spyOn(protocolApi, 'list').mockResolvedValue([])})
const run = { id: 1, status: 'completed', processed_responses: 1, total_responses: 1, summary: { total_evaluated: 1, successful_evaluations: 1, execution_failures: 0, hallucinations: 0, average_overall_accuracy: 100 } }

test('run action and summary', async () => {
  const start = vi.spyOn(evaluationApi, 'run').mockResolvedValue(run)
  render(<RunEvaluation projectId="1" imported={{ cases: [{}], models: [{}], responses: [{}] }} />)
  fireEvent.click(screen.getByText('Run Evaluation'))
  await screen.findByText(/Run 1: completed/)
  expect(start).toHaveBeenCalledTimes(1)
  expect(screen.getByText(/Average overall accuracy: 100/)).toBeTruthy()
})

test('explorer dynamic models filters pagination and details', async () => {
  vi.spyOn(evaluationApi, 'list').mockResolvedValue([run])
  const results = vi.spyOn(evaluationApi, 'results').mockResolvedValue({ total: 21, models: ['Future Model'], items: [{ id: 1, case_id: 'C1', model: 'Future Model', overall_accuracy: 100, scores: { syntax: 1, custom: 0.5 }, hallucination_detected: false, hallucinated_functions: [], error_tags: [], notes: ['note'], snapshot: { requirement: 'Preserved requirement' } }] })
  render(<ResultsExplorer projectId="1" />)
  await screen.findByText('Run 1 — completed')
  fireEvent.change(screen.getByLabelText('Evaluation run'), { target: { value: '1' } })
  await screen.findByText('C1')
  fireEvent.click(screen.getByText('C1'))
  expect(screen.getByText(/Preserved requirement/)).toBeTruthy()
  fireEvent.click(screen.getByText(/Close details \/ Back to Results Explorer/))
  fireEvent.click(screen.getByText('Next'))
  await waitFor(() => expect(results.mock.calls.at(-1)?.[2]).toContain('page=2'))
  fireEvent.change(screen.getByLabelText('search'), { target: { value: 'C1' } })
  await waitFor(() => expect(results.mock.calls.at(-1)?.[2]).toContain('search=C1'))
})

test('run errors are readable', async () => {
  const start = vi.spyOn(evaluationApi, 'run').mockRejectedValue(new Error('network'))
  render(<RunEvaluation projectId="1" imported={{ cases: [{}], models: [{}], responses: [{}] }} />)
  fireEvent.click(screen.getByText('Run Evaluation'))
  expect((await screen.findByRole('alert')).textContent).toContain('Reload saved runs')
  expect((screen.getByText('Run Evaluation') as HTMLButtonElement).disabled).toBe(true)
  fireEvent.click(screen.getByText('Run Evaluation'))
  expect(start).toHaveBeenCalledTimes(1)
})
