// @vitest-environment jsdom
import { afterEach, expect, test, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { DatasetPreview } from './DatasetPreview'
import { DatasetUpload } from './DatasetUpload'

afterEach(() => { cleanup(); vi.unstubAllGlobals() })
const base = { filename: 'data.xlsx', extension: '.xlsx', size: 3, sheet_names: ['One', 'Two'], sheet_count: 2 }
const sheet = (name: string, value: string) => ({ ...base, selected_sheet: name, columns: ['id'], column_count: 1, total_row_count: 1, inferred_data_types: ['text'], preview_rows: [{ row_index: 1, values: [value] }] })
const response = (data: unknown) => new Response(JSON.stringify(data))

test('XLSX preview preserves duplicate/blank headers, order, nulls and scalar values', () => {
  render(<DatasetPreview dataset={{ ...base, selected_sheet: 'One', columns: ['id', 'id', null, '', '日期', 'time'], preview_rows: [{ row_index: 1, values: ['A', 10.5, null, false, '2026-09-08', '2026-09-08T12:00:00'] }, { row_index: 2, values: ['B', 0, true, 'بيانات', '<script>text</script>', ''] }] }} />)
  const rows = within(screen.getByRole('table')).getAllByRole('row')
  expect(Array.from(rows[0].children).map(cell => cell.textContent)).toEqual(['id', 'id', '(blank header)', '(blank header)', '日期', 'time'])
  expect(Array.from(rows[1].children).map(cell => cell.textContent)).toEqual(['A', '10.5', 'null', 'false', '2026-09-08', '2026-09-08T12:00:00'])
  expect(screen.getByText('<script>text</script>')).toBeTruthy()
  expect(screen.getByRole('region').className).toContain('overflow-x-auto')
})

test('CSV renders in backend column order and reset removes preview', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response({ filename: 'a.csv', extension: '.csv', size: 3, columns: ['b', 'a'], preview_rows: [{ a: null, b: 'CSV value' }] })))
  render(<DatasetUpload />)
  fireEvent.change(screen.getByLabelText('Dataset file'), { target: { files: [new File(['abc'], 'a.csv')] } })
  fireEvent.click(screen.getByText('Upload file'))
  await screen.findByText('CSV value')
  expect(screen.queryByRole('combobox')).toBeNull()
  expect(within(screen.getByRole('table')).getAllByRole('cell').map(cell => cell.textContent)).toEqual(['CSV value', 'null'])
  fireEvent.click(screen.getByText('Change File'))
  expect(screen.queryByRole('table')).toBeNull()
})

test('empty preview is clear', () => {
  render(<DatasetPreview dataset={{ ...base, columns: [], preview_rows: [] }} />)
  expect(screen.getByText('No data rows to preview.')).toBeTruthy()
  expect(screen.queryByRole('table')).toBeNull()
})

test('sheet switching clears stale preview, prevents duplicates and Change File resets', async () => {
  let finish!: (value: Response) => void
  const fetch = vi.fn().mockResolvedValueOnce(response(base)).mockResolvedValueOnce(response(sheet('One', 'old preview'))).mockImplementationOnce(() => new Promise<Response>(resolve => { finish = resolve }))
  vi.stubGlobal('fetch', fetch)
  render(<DatasetUpload />)
  fireEvent.change(screen.getByLabelText('Dataset file'), { target: { files: [new File(['abc'], 'data.xlsx')] } })
  fireEvent.click(screen.getByText('Upload file'))
  const selector = await screen.findByRole('combobox')
  expect(screen.queryByRole('table', { name: 'Dataset preview' })).toBeNull()
  fireEvent.change(selector, { target: { value: 'One' } })
  await screen.findByText('old preview')
  fireEvent.change(selector, { target: { value: 'Two' } })
  expect(screen.queryByText('old preview')).toBeNull()
  fireEvent.change(selector, { target: { value: 'One' } })
  expect(fetch).toHaveBeenCalledTimes(3)
  finish(response(sheet('Two', 'new preview')))
  await screen.findByText('new preview')
  fireEvent.click(screen.getByText('Change File'))
  expect(screen.queryByText('new preview')).toBeNull()
  expect(screen.queryByRole('combobox')).toBeNull()
  fireEvent.change(screen.getByLabelText('Dataset file'), { target: { files: [new File(['different'], 'new.csv')] } })
  expect(screen.queryByRole('table')).toBeNull()
})

test('invalid preview is a readable error, not a render crash', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(response(base)).mockResolvedValueOnce(response({ ...sheet('One', 'value'), preview_rows: [{ row_index: 1, values: [{}] }] })))
  render(<DatasetUpload />)
  fireEvent.change(screen.getByLabelText('Dataset file'), { target: { files: [new File(['abc'], 'data.xlsx')] } })
  fireEvent.click(screen.getByText('Upload file'))
  fireEvent.change(await screen.findByRole('combobox'), { target: { value: 'One' } })
  expect((await screen.findByRole('alert')).textContent).toContain('invalid dataset response')
  expect(screen.queryByRole('table')).toBeNull()
})
