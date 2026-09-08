// @vitest-environment jsdom
import { afterEach, expect, test, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { ResultReview } from './ResultReview'
import { GroundTruthWarnings } from './GroundTruthWarnings'
import { reviewApi, type ReviewDetails } from '../../api/client'

afterEach(() => { cleanup(); vi.restoreAllMocks() })
const result: ReviewDetails = { id: 1, case_id: 'C1', model: 'Dynamic', overall_accuracy: 50, scores: { custom: 0.5 }, automated_scores: { custom: 0.5 }, override_scores: {}, accepted_scores: { custom: 0.5 }, error_tags: [], notes: [], hallucination_detected: false, hallucinated_functions: [], snapshot: { case: { requirement: 'Requirement text', expected_rule: 'Rule' }, response: { generated_output: 'Output' } }, review_note: '', audit_history: [], ground_truth_warnings: [], ground_truth_warning: true }

test('review renders, requires reason, saves and shows audit', async () => {
  vi.spyOn(reviewApi, 'get').mockResolvedValue(result)
  const save = vi.spyOn(reviewApi, 'save').mockResolvedValue({ ...result, override_scores: { custom: 1 }, accepted_scores: { custom: 1 }, audit_history: [{ reason: 'Confirmed', actor: 'researcher' }] })
  render(<ResultReview projectId="1" runId={1} result={result} />)
  fireEvent.change(await screen.findByLabelText('Override custom'), { target: { value: '1' } })
  fireEvent.click(screen.getByText('Save review'))
  expect(screen.getByRole('alert').textContent).toContain('reason')
  expect(save).not.toHaveBeenCalled()
  fireEvent.change(screen.getByLabelText('Review reason'), { target: { value: 'Confirmed' } })
  fireEvent.click(screen.getByText('Save review'))
  await screen.findByText('Review saved')
  expect(screen.getByText('Ground Truth Warning')).toBeTruthy()
  expect(screen.getByText(/"actor": "researcher"/)).toBeTruthy()
  expect(screen.getByText('Automated')).toBeTruthy()
  expect(screen.getByText('Accepted Final')).toBeTruthy()
})

test('warning list filters', async () => {
  vi.spyOn(reviewApi, 'warnings').mockResolvedValue([{ case_id: 'A', warning_type: 'ONE', severity: 'critical', message: 'First' }, { case_id: 'B', warning_type: 'TWO', severity: 'info', message: 'Second' }])
  render(<GroundTruthWarnings projectId="1" runId={1} />)
  fireEvent.click(screen.getByText('Ground Truth Warnings'))
  await screen.findByText('First')
  fireEvent.change(screen.getByLabelText('Warning severity'), { target: { value: 'info' } })
  expect(screen.queryByText('First')).toBeNull()
  expect(screen.getByText('Second')).toBeTruthy()
  fireEvent.change(screen.getByLabelText('Warning case search'), {target: {value: 'missing'}})
  expect(screen.queryByText('Second')).toBeNull()
})

test('notes-only review does not fabricate metric overrides and respects custom scale', async () => {
  vi.spyOn(reviewApi, 'get').mockResolvedValue({...result, metric_configuration: [{key: 'custom', min_score: 0, max_score: 10}]})
  const save = vi.spyOn(reviewApi, 'save').mockResolvedValue(result)
  render(<ResultReview projectId="1" runId={1} result={result}/>)
  const input = await screen.findByLabelText('Override custom') as HTMLInputElement
  expect(input.max).toBe('10')
  fireEvent.change(screen.getByLabelText('Review note'), {target: {value: 'Research note'}})
  fireEvent.click(screen.getByText('Save review'))
  await screen.findByText('Review saved')
  expect(save).toHaveBeenCalledWith('1', 1, 1, expect.objectContaining({override_scores: {}, review_note: 'Research note'}))
})
