// @vitest-environment jsdom
import { afterEach, expect, test, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { researchApi, type AnalystSummary } from '../../api/research'
import { ResearchSummary } from './ResearchSummary'

const data: AnalystSummary = {
  model_findings: [], dimension_findings: [], reliability_findings: [], hallucination_findings: [],
  agreement_findings: [], error_findings: [], ground_truth_notes: [], limitations: [], scope: {run_id: 7},
  overview: [{finding_type: 'accuracy', title: 'Overall Accuracy', text: 'Observed accuracy is 80%.', supporting_metric: 'average_overall_accuracy', value: 80, evidence_count: 20}],
  strategy_findings: [{finding_type: 'unavailable', title: 'Not Available', text: 'No strategy metadata observations are available.', supporting_metric: 'strategies', value: null, evidence_count: 0}],
}
afterEach(() => {cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals()})

test('summary renders evidence and missing optional sections', async () => {
  vi.spyOn(researchApi, 'analyst').mockResolvedValue(data)
  render(<ResearchSummary projectId="1" query="run_id=7"/>)
  expect(await screen.findByText('Observed accuracy is 80%.')).toBeTruthy()
  expect(screen.getByText(/Evidence count: 20/)).toBeTruthy()
  expect(screen.getByText('No strategy metadata observations are available.')).toBeTruthy()
  expect(screen.getAllByText('Not Available: no findings in this scope.').length).toBeGreaterThan(0)
})

test('copy whole summary and individual finding includes evidence', async () => {
  vi.spyOn(researchApi, 'analyst').mockResolvedValue(data)
  const writeText = vi.fn().mockResolvedValue(undefined)
  vi.stubGlobal('navigator', {clipboard: {writeText}})
  render(<ResearchSummary projectId="1" query="run_id=7"/>)
  fireEvent.click(await screen.findByRole('button', {name: 'Copy Research Summary'}))
  await screen.findByText('Copied to clipboard.')
  expect(writeText.mock.calls[0][0]).toContain('"run_id":7')
  expect(writeText.mock.calls[0][0]).toContain('evidence count=20')
  fireEvent.click(screen.getByLabelText('Copy finding overview 1'))
  await waitFor(() => expect(writeText).toHaveBeenCalledTimes(2))
  expect(writeText.mock.calls[1][0]).toContain('Observed accuracy is 80%.')
})

test('loading error retry and clipboard failure', async () => {
  const api = vi.spyOn(researchApi, 'analyst').mockRejectedValueOnce(new Error('offline'))
  render(<ResearchSummary projectId="1" query=""/>)
  expect(screen.getByRole('status').textContent).toContain('Loading')
  expect((await screen.findByRole('alert')).textContent).toContain('Unable to load')
  api.mockResolvedValue(data)
  vi.stubGlobal('navigator', {clipboard: {writeText: vi.fn().mockRejectedValue(new Error('denied'))}})
  fireEvent.click(screen.getByText('Retry summary'))
  fireEvent.click(await screen.findByRole('button', {name: 'Copy Research Summary'}))
  expect((await screen.findByRole('alert')).textContent).toContain('Clipboard unavailable')
})

test('filter changes clear old findings and ignore stale responses', async () => {
  let finish: (value: AnalystSummary) => void = () => {}
  const api = vi.spyOn(researchApi, 'analyst').mockResolvedValueOnce(data)
  const {rerender} = render(<ResearchSummary projectId="1" query="run_id=7"/>)
  await screen.findByText('Observed accuracy is 80%.')
  api.mockImplementationOnce(() => new Promise(resolve => {finish = resolve}))
  rerender(<ResearchSummary projectId="1" query="run_id=8"/>)
  expect(screen.queryByText('Observed accuracy is 80%.')).toBeNull()
  api.mockResolvedValueOnce({...data, overview: []})
  rerender(<ResearchSummary projectId="1" query="run_id=9"/>)
  await screen.findByRole('button', {name: 'Copy Research Summary'})
  finish(data)
  await waitFor(() => expect(screen.queryByText('Observed accuracy is 80%.')).toBeNull())
})
