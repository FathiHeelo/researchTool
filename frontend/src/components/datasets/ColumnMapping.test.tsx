// @vitest-environment jsdom
import { afterEach, expect, test, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { ColumnMapping } from './ColumnMapping'

afterEach(() => { cleanup(); vi.unstubAllGlobals() })
test('validates roles and sends arbitrary models and metadata', async () => {
  const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({
    cases: [{id:'row_2',case_id:'C1',requirement:'Requirement',expected_rule:'Rule',metadata:[]}],
    models: [{id:'column_2'}], responses: [{case_reference:'row_2',model:'column_2',generated_output:'Output',metadata:[]}],
  })))
  vi.stubGlobal('fetch', fetch)
  render(<ColumnMapping file={new File(['data'], 'data.csv')} dataset={{ filename: 'data.csv', extension: '.csv', size: 4, columns: ['req', 'rule', 'Future model', 'Custom context'] }} />)
  fireEvent.click(screen.getByText('Configure Columns'))
  const submit = screen.getByText('Validate Mapping and Import') as HTMLButtonElement
  expect(submit.disabled).toBe(true)
  for (const [i, role] of ['requirement', 'expected_rule', 'model'].entries()) fireEvent.change(screen.getByLabelText(`Role for column ${i + 1}`), { target: { value: role } })
  fireEvent.change(screen.getByLabelText('Prompt Strategy'), {target: {value: 'Any researcher strategy'}})
  fireEvent.click(screen.getByText('+ Add Metadata'))
  fireEvent.change(screen.getByLabelText('Metadata key 1'), {target: {value: 'Arbitrary study axis'}})
  fireEvent.change(screen.getByLabelText('Metadata value 1'), {target: {value: 'Cohort A'}})
  fireEvent.click(screen.getByText('+ Add Metadata'))
  expect(screen.getByLabelText('Metadata key 2')).toBeTruthy()
  fireEvent.click(screen.getAllByText('Remove metadata')[1])
  expect(screen.queryByLabelText('Metadata key 2')).toBeNull()
  expect(submit.disabled).toBe(false)
  fireEvent.click(submit)
  await screen.findByRole('status')
  const mapping = JSON.parse(fetch.mock.calls[0][1].body.get('mapping'))
  expect(mapping.assignments[2].label).toBe('Future model')
  expect(mapping.assignments[3].role).toBe('metadata')
  expect(mapping.constant_metadata).toEqual([
    {key: 'Prompt Strategy', value: 'Any researcher strategy'},
    {key: 'Arbitrary study axis', value: 'Cohort A'},
  ])
})
