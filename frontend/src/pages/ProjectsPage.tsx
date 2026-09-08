import { useEffect, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { projectsApi, type Project } from '../api/client'

export function ProjectsPage() {
  const [projects, setProjects] = useState<Project[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [actionError, setActionError] = useState('')
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState<number | null>(null)
  const [reload, setReload] = useState(0)

  useEffect(() => {
    const controller = new AbortController()
    setLoading(true)
    setError('')
    projectsApi.list(controller.signal)
      .then(data => { if (!controller.signal.aborted) setProjects(data) })
      .catch(() => { if (!controller.signal.aborted) setError('Unable to load projects. Check the backend connection and try again.') })
      .finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [reload])

  async function createProject(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!name.trim() || saving) return
    setSaving(true)
    setActionError('')
    try {
      const project = await projectsApi.create({ name: name.trim(), description: description.trim() || null })
      setProjects(previous => [project, ...previous])
      setName('')
      setDescription('')
    } catch {
      setActionError('Unable to create project. Please try again.')
    } finally { setSaving(false) }
  }

  async function deleteProject(project: Project) {
    if (deleting !== null || !window.confirm(`Delete project "${project.name}"? This cannot be undone.`)) return
    setDeleting(project.id)
    setActionError('')
    try {
      await projectsApi.delete(project.id)
      setProjects(previous => previous.filter(item => item.id !== project.id))
    } catch {
      setActionError('Unable to delete project. Please reload the list and try again.')
    } finally { setDeleting(null) }
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Projects</h1>
      <form onSubmit={createProject} className="space-y-4 rounded-lg border border-slate-200 bg-white p-6">
        <h2 className="text-lg font-medium">Create project</h2>
        <label className="block text-sm font-medium" htmlFor="project-name">Name</label>
        <input id="project-name" required maxLength={200} value={name} onChange={event => setName(event.target.value)} disabled={saving} className="w-full rounded border border-slate-300 px-3 py-2" />
        <label className="block text-sm font-medium" htmlFor="project-description">Description (optional)</label>
        <textarea id="project-description" rows={3} value={description} onChange={event => setDescription(event.target.value)} disabled={saving} className="w-full rounded border border-slate-300 px-3 py-2" />
        <button disabled={saving || loading || !!error || !name.trim()} className="rounded bg-slate-800 px-4 py-2 text-sm text-white disabled:opacity-50">{saving ? 'Creating…' : 'Create project'}</button>
      </form>
      {actionError && <p role="alert" className="text-red-700">{actionError}</p>}
      <section aria-label="Existing projects" className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-medium">Existing projects</h2>
          <button onClick={() => setReload(value => value + 1)} disabled={loading || saving || deleting !== null} className="text-sm underline disabled:opacity-50">Reload</button>
        </div>
        {loading ? <p role="status">Loading projects…</p> : error ? <p role="alert" className="text-red-700">{error}</p> : projects.length === 0 ? <p className="text-slate-600">No projects yet. Create a project to get started.</p> : (
          <ul className="space-y-3">
            {projects.map(project => (
              <li key={project.id} className="flex flex-wrap items-start justify-between gap-4 rounded-lg border border-slate-200 bg-white p-5">
                <div className="min-w-0 flex-1">
                  <Link to={`/projects/${project.id}`} className="break-words font-medium underline">{project.name}</Link>
                  {project.description && <p className="mt-2 whitespace-pre-wrap break-words text-sm text-slate-600">{project.description}</p>}
                  <p className="mt-2 text-xs text-slate-500">Created {new Date(project.created_at).toLocaleString()}</p>
                </div>
                <button onClick={() => void deleteProject(project)} disabled={deleting !== null} aria-label={`Delete ${project.name}`} className="rounded border border-slate-300 px-3 py-2 text-sm disabled:opacity-50">{deleting === project.id ? 'Deleting…' : 'Delete'}</button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
