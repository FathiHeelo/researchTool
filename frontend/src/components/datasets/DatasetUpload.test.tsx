// @vitest-environment jsdom
import { afterEach, expect, test, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { DatasetUpload } from './DatasetUpload'

afterEach(() => { cleanup(); vi.unstubAllGlobals() })

function choose(name: string) {
  fireEvent.change(screen.getByLabelText('Dataset file'), { target: { files: [new File(['a\n1'], name)] } })
}

test('CSV sends multipart once and displays metadata then resets', async () => {
  const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ filename: 'data.csv', extension: '.csv', size: 3, total_row_count: 1, column_count: 1 })))
  vi.stubGlobal('fetch', fetch)
  render(<DatasetUpload />)
  choose('data.csv')
  fireEvent.click(screen.getByText('Upload file'))
  expect((screen.getByRole('button', { name: 'Uploading…' }) as HTMLButtonElement).disabled).toBe(true)
  await screen.findByText('Upload successful')
  expect(fetch).toHaveBeenCalledTimes(1)
  const [url, options] = fetch.mock.calls[0]
  expect(url).toMatch(/\/datasets\/upload$/)
  expect(options.body).toBeInstanceOf(FormData)
  expect(options.body.get('file').name).toBe('data.csv')
  expect(options.headers).toBeUndefined()
  expect(screen.getByText('Data rows:')).toBeTruthy()
  fireEvent.click(screen.getByText('Change File'))
  expect(screen.queryByText('Upload successful')).toBeNull()
  expect(screen.getByLabelText('Dataset file')).toBeTruthy()
})

test('XLSX drag and drop shows read-only worksheets', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ filename: 'data.xlsx', extension: '.xlsx', size: 3, sheet_count: 2, sheet_names: ['Orders', 'بيانات'] }))))
  render(<DatasetUpload />)
  fireEvent.drop(screen.getByText(/Drop one CSV/).parentElement!, { dataTransfer: { files: [new File(['abc'], 'data.xlsx')] } })
  fireEvent.click(screen.getByText('Upload file'))
  await screen.findAllByText('Orders')
  expect(screen.getAllByText('بيانات').length).toBeGreaterThan(0)
  expect((screen.getByRole('combobox') as HTMLSelectElement).value).toBe('')
})

test('unsupported and missing files are rejected without requests', () => {
  const fetch = vi.fn()
  vi.stubGlobal('fetch', fetch)
  render(<DatasetUpload />)
  fireEvent.click(screen.getByText('Upload file'))
  expect(screen.getByRole('alert').textContent).toContain('select a file')
  choose('data.exe')
  expect(screen.getByRole('alert').textContent).toContain('Only .csv and .xlsx')
  expect(fetch).not.toHaveBeenCalled()
  fireEvent.click(screen.getByText('Change File'))
  expect(screen.queryByRole('alert')).toBeNull()
})

test.each(['Uploaded file must not be empty', 'XLSX is malformed or cannot be opened as an Excel workbook'])('backend error: %s', async detail => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ detail }), { status: 400 })))
  render(<DatasetUpload />)
  choose('data.xlsx')
  fireEvent.click(screen.getByText('Upload file'))
  await waitFor(() => expect(screen.getByRole('alert').textContent).toBe(detail))
  expect((screen.getByText('Upload file') as HTMLButtonElement).disabled).toBe(false)
})

test('network error is readable', async () => {
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('fetch failed')))
  render(<DatasetUpload />)
  choose('data.csv')
  fireEvent.click(screen.getByText('Upload file'))
  await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('Unable to reach the backend'))
})
