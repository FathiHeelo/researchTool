// @vitest-environment jsdom
import { afterEach, expect, test, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { ColumnMapping } from './ColumnMapping'

afterEach(() => { cleanup(); vi.unstubAllGlobals() })
test('validates roles and sends arbitrary models and metadata', async () => {
  const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ cases: [{}], models: [{}], responses: [{}] })))
  vi.stubGlobal('fetch', fetch)
  render(<ColumnMapping file={new File(['data'], 'data.csv')} dataset={{ filename: 'data.csv', extension: '.csv', size: 4, columns: ['req', 'rule', 'Future model', 'Custom context'] }} />)
  fireEvent.click(screen.getByText('Configure Columns'))
  const submit = screen.getByText('Validate Mapping and Import') as HTMLButtonElement
  expect(submit.disabled).toBe(true)
  for (const [i, role] of ['requirement', 'expected_rule', 'model'].entries()) fireEvent.change(screen.getByLabelText(`Role for column ${i + 1}`), { target: { value: role } })
  expect(submit.disabled).toBe(false)
  fireEvent.click(submit)
  await screen.findByRole('status')
  const mapping = JSON.parse(fetch.mock.calls[0][1].body.get('mapping'))
  expect(mapping.assignments[2].label).toBe('Future model')
  expect(mapping.assignments[3].role).toBe('metadata')
})
