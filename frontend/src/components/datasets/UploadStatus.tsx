import type { DatasetMetadata } from '../../api/client'

export function UploadStatus({ uploading, error, result }: { uploading: boolean; error: string; result: DatasetMetadata | null }) {
  return (
    <div aria-live="polite">
      {uploading && <p role="status">Uploading…</p>}
      {error && <p role="alert" className="text-red-700">{error}</p>}
      {result && <div className="space-y-3">
        <p role="status" className="font-medium">Upload successful</p>
        <dl className="space-y-2 break-words text-sm text-slate-600">
          <div><dt className="inline font-medium">Filename: </dt><dd className="inline">{result.filename}</dd></div>
          <div><dt className="inline font-medium">Extension: </dt><dd className="inline">{result.extension}</dd></div>
          <div><dt className="inline font-medium">Size: </dt><dd className="inline">{result.size.toLocaleString()} bytes</dd></div>
          {result.total_row_count !== undefined && <div><dt className="inline font-medium">Data rows: </dt><dd className="inline">{result.total_row_count}</dd></div>}
          {result.column_count !== undefined && <div><dt className="inline font-medium">Columns: </dt><dd className="inline">{result.column_count}</dd></div>}
          {result.sheet_count !== undefined && <div><dt className="inline font-medium">Worksheets: </dt><dd className="inline">{result.sheet_count}</dd></div>}
        </dl>
        {result.sheet_names && <div><p className="text-sm font-medium">Available worksheets</p><ul className="mt-2 list-inside list-disc text-sm text-slate-600">{result.sheet_names.map((name, index) => <li className="whitespace-pre-wrap break-words" key={index}>{name}</li>)}</ul></div>}
      </div>}
    </div>
  )
}
