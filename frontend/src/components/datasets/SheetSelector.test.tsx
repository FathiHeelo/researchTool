// @vitest-environment jsdom
import { afterEach, expect, test, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { DatasetUpload } from './DatasetUpload'

afterEach(() => { cleanup(); vi.unstubAllGlobals() })
const names = [' Orders ', 'بيانات']
const workbook = { filename: 'data.xlsx', extension: '.xlsx', size: 3, sheet_count: 2, sheet_names: names }
const response = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status })
const selected = (name: string) => ({ ...workbook, selected_sheet: name, total_row_count: 2, column_count: 2, columns: ['id', null], inferred_data_types: ['text', 'unknown'] })

async function start() {
  render(<DatasetUpload />)
  fireEvent.change(screen.getByLabelText('Dataset file'), { target: { files: [new File(['abc'], 'data.xlsx')] } })
  fireEvent.click(screen.getByText('Upload file'))
  return await screen.findByRole('combobox') as HTMLSelectElement
}

test('explicit selection preserves names, resends file, switches sheets and resets', async () => {
  const fetch = vi.fn().mockResolvedValueOnce(response(workbook)).mockResolvedValueOnce(response(selected(names[0]))).mockResolvedValueOnce(response(selected(names[1])))
  vi.stubGlobal('fetch', fetch)
  const selector = await start()
  expect(selector.value).toBe('')
  expect(Array.from(selector.options).slice(1).map(option => option.value)).toEqual(names)
  expect(fetch).toHaveBeenCalledTimes(1)
  fireEvent.change(selector, { target: { value: names[0] } })
  expect(selector.disabled).toBe(true)
  await screen.findByText('Sheet selected successfully')
  expect(fetch.mock.calls[1][1].body.get('sheet_name')).toBe(names[0])
  expect(fetch.mock.calls[1][1].body.get('file')).toBe(fetch.mock.calls[0][1].body.get('file'))
  expect(fetch.mock.calls[1][1].headers).toBeUndefined()
  fireEvent.change(selector, { target: { value: names[1] } })
  await screen.findByText(`Selected sheet: ${names[1]}`)
  expect(fetch).toHaveBeenCalledTimes(3)
  expect(screen.queryByText(`Selected sheet: ${names[0]}`)).toBeNull()
  fireEvent.click(screen.getByText('Change File'))
  expect(screen.queryByRole('combobox')).toBeNull()
  expect(screen.queryByText('Sheet selected successfully')).toBeNull()
  expect(screen.getByLabelText('Dataset file')).toBeTruthy()
})

test.each(['invalid', 'network', 'malformed'])('handles %s sheet error and retry', async kind => {
  const fetch = vi.fn().mockResolvedValueOnce(response(workbook))
  if (kind === 'network') fetch.mockRejectedValueOnce(new Error('socket error'))
  else fetch.mockResolvedValueOnce(kind === 'invalid' ? response({ detail: 'Requested worksheet does not exist' }, 400) : response({ ...workbook, selected_sheet: names[0], columns: 'invalid' }))
  fetch.mockResolvedValueOnce(response(selected(names[0])))
  vi.stubGlobal('fetch', fetch)
  const selector = await start()
  fireEvent.change(selector, { target: { value: names[0] } })
  await screen.findByRole('alert')
  expect(selector.disabled).toBe(false)
  fireEvent.click(screen.getByText('Retry sheet'))
  await screen.findByText('Sheet selected successfully')
  expect(screen.queryByRole('alert')).toBeNull()
})

test('CSV has no sheet selector', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response({ filename: 'data.csv', extension: '.csv', size: 3, total_row_count: 1, column_count: 1 })))
  render(<DatasetUpload />)
  fireEvent.change(screen.getByLabelText('Dataset file'), { target: { files: [new File(['abc'], 'data.csv')] } })
  fireEvent.click(screen.getByText('Upload file'))
  await waitFor(() => expect(screen.getByText('Upload successful')).toBeTruthy())
  expect(screen.queryByRole('combobox')).toBeNull()
})

test('types align with duplicate, blank and Unicode headers and refresh on switching', async () => {
  const first = { ...selected(names[0]), column_count: 5, columns: ['id', 'id', null, '', 'بيانات'], inferred_data_types: ['text', 'integer', 'unknown', 'boolean', 'decimal'] }
  const second = { ...selected(names[1]), column_count: 1, columns: [' New '], inferred_data_types: ['date'] }
  vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(response(workbook)).mockResolvedValueOnce(response(first)).mockResolvedValueOnce(response(second)))
  const selector = await start()
  fireEvent.change(selector, { target: { value: names[0] } })
  const table = await screen.findByRole('table', { name: 'Column metadata' })
  const cells = within(table).getAllByRole('row').slice(1).map(row => Array.from(row.children).map(cell => cell.textContent))
  expect(cells).toEqual([['id', 'text'], ['id', 'integer'], ['(blank header)', 'unknown'], ['(blank header)', 'boolean'], ['بيانات', 'decimal']])
  fireEvent.change(selector, { target: { value: names[1] } })
  expect(screen.queryByRole('table')).toBeNull()
  await screen.findByText('date')
  expect(screen.queryByText('integer')).toBeNull()
  expect(screen.getByRole('rowheader').textContent).toBe(' New ')
  fireEvent.click(screen.getByText('Change File'))
  expect(screen.queryByRole('table')).toBeNull()
  expect(screen.queryByText('date')).toBeNull()
})

test.each([true, false])('handles empty/header-only sheet: empty=%s', async empty => {
  const metadata = { ...selected(names[0]), total_row_count: 0, column_count: empty ? 0 : 1, columns: empty ? [] : ['Header'], inferred_data_types: empty ? [] : ['unknown'] }
  vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(response(workbook)).mockResolvedValueOnce(response(metadata)))
  const selector = await start()
  fireEvent.change(selector, { target: { value: names[0] } })
  await screen.findByText('Data rows: 0')
  if (empty) expect(screen.getByText('No columns in this worksheet.')).toBeTruthy()
  else expect(screen.getByText('unknown')).toBeTruthy()
})

test('rejects misaligned type metadata without displaying misleading types', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(response(workbook)).mockResolvedValueOnce(response({ ...selected(names[0]), inferred_data_types: ['text'] })))
  const selector = await start()
  fireEvent.change(selector, { target: { value: names[0] } })
  expect((await screen.findByRole('alert')).textContent).toContain('invalid dataset response')
  expect(screen.queryByRole('table')).toBeNull()
})
