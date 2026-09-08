import { useEffect, useState } from 'react'
import { checkHealth } from '../api/client'

export function HomePage() {
  const [status, setStatus] = useState<'Checking…' | 'Connected' | 'Unavailable'>('Checking…')

  useEffect(() => {
    const controller = new AbortController()
    let active = true
    const timeout = window.setTimeout(() => controller.abort(), 5000)
    checkHealth(controller.signal)
      .then(() => { if (active) setStatus('Connected') })
      .catch(() => { if (active) setStatus('Unavailable') })
      .finally(() => window.clearTimeout(timeout))
    return () => {
      active = false
      window.clearTimeout(timeout)
      controller.abort()
    }
  }, [])

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-6">
      <h1 className="text-2xl font-semibold">Workspace</h1>
      <p className="mt-2 text-slate-600">Your research workspace foundation.</p>
      <div className="mt-6 flex items-center gap-3 text-sm">
        <span className="font-medium">Backend connection</span>
        <span role="status" className="rounded-full bg-slate-100 px-3 py-1 text-slate-700">{status}</span>
      </div>
    </section>
  )
}
