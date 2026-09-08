import type { DatasetMetadata, DatasetValue, XLSXPreviewRow } from '../../api/client'

export function DatasetPreview({ dataset }: { dataset: DatasetMetadata }) {
  const columns = dataset.columns || []
  const rows = dataset.preview_rows
  if (!rows) return <p className="text-sm text-slate-600">Preview unavailable.</p>
  if (!rows.length) return <p className="text-sm text-slate-600">No data rows to preview.</p>
  const positional = dataset.selected_sheet !== undefined
  return (
    <section className="space-y-2">
      <h3 className="text-sm font-medium">Dataset preview</h3>
      <p className="text-xs text-slate-500">Showing {rows.length} preview rows.</p>
      <div className="overflow-x-auto" tabIndex={0} role="region" aria-label="Scrollable dataset preview">
        <table aria-label="Dataset preview" className="w-full border-collapse text-left text-sm">
          <thead><tr>{columns.map((column, index) => <th scope="col" key={index} className="whitespace-pre border-b border-slate-300 px-3 py-2">{column === null || column === '' ? '(blank header)' : String(column)}</th>)}</tr></thead>
          <tbody>{rows.map((row, rowIndex) => <tr key={rowIndex}>
            {columns.map((column, columnIndex) => {
              const value = positional ? (row as XLSXPreviewRow).values[columnIndex] : (row as Record<string, DatasetValue>)[String(column)]
              return <td key={columnIndex} className="whitespace-pre-wrap border-b border-slate-100 px-3 py-2">{value === null || value === undefined ? <span className="italic text-slate-500">null</span> : String(value)}</td>
            })}
          </tr>)}</tbody>
        </table>
      </div>
    </section>
  )
}
