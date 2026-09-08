import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { projectsApi, type Project } from '../api/client'
import { DatasetUpload } from '../components/datasets/DatasetUpload'
import { ResultsExplorer } from '../components/datasets/ResultsExplorer'
import { ResearchDashboard } from '../components/datasets/ResearchDashboard'
import { ResearchAnalytics } from '../components/datasets/ResearchAnalytics'

export function ProjectPage() {
  const { projectId = '' } = useParams()
  const [project, setProject] = useState<Project | null>(null)
  const [error, setError] = useState('')
  const [reload, setReload] = useState(0)

  useEffect(() => {
    const controller = new AbortController()
    setProject(null)
    setError('')
    projectsApi.get(projectId, controller.signal)
      .then(data => { if (!controller.signal.aborted) setProject(data) })
      .catch((reason: unknown) => {
        if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : 'Unable to load project.')
      })
    return () => controller.abort()
  }, [projectId, reload])

  return (
    <div className="space-y-6">
      <Link to="/projects" className="text-sm underline">Back to projects</Link>
      {error ? <div role="alert"><p>{error}</p><button className="mt-3 underline" onClick={() => setReload(value => value + 1)}>Try again</button></div> : !project ? <p role="status">Loading project…</p> : (
        <section className="rounded-lg border border-slate-200 bg-white p-6">
          <p className="mb-2 text-sm text-slate-500">Selected project</p>
          <h1 className="break-words text-2xl font-semibold">{project.name}</h1>
          <p className="mt-4 whitespace-pre-wrap break-words text-slate-600">{project.description || 'No description provided.'}</p>
          <dl className="mt-6 space-y-2 text-sm text-slate-600">
            <div><dt className="inline font-medium">Created: </dt><dd className="inline">{new Date(project.created_at).toLocaleString()}</dd></div>
            <div><dt className="inline font-medium">Updated: </dt><dd className="inline">{new Date(project.updated_at).toLocaleString()}</dd></div>
          </dl>
        </section>
      )}
      {project && !error && <DatasetUpload key={projectId} />}
      {project && !error && <ResearchDashboard key={`dashboard-${projectId}`} projectId={projectId} />}
      {project && !error && <ResearchAnalytics key={`research-${projectId}`} projectId={projectId} />}
      {project && !error && <ResultsExplorer key={`results-${projectId}`} projectId={projectId} />}
    </div>
  )
}
