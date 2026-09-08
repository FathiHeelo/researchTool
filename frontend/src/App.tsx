import { NavLink, Route, Routes } from 'react-router-dom'
import { HomePage } from './pages/HomePage'
import { ProjectsPage } from './pages/ProjectsPage'
import { ProjectPage } from './pages/ProjectPage'

export default function App() {
  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-4 px-6 py-5">
          <span className="text-lg font-semibold">DQ-LLM Evaluator</span>
          <nav aria-label="Main navigation">
            <NavLink to="/" className="rounded px-3 py-2 text-sm font-medium hover:bg-slate-100">Home</NavLink>
            <NavLink to="/projects" className="rounded px-3 py-2 text-sm font-medium hover:bg-slate-100">Projects</NavLink>
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-6 py-10">
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/projects" element={<ProjectsPage />} />
          <Route path="/projects/:projectId" element={<ProjectPage />} />
          <Route path="*" element={<p>Page not found. <NavLink to="/" className="underline">Return home</NavLink></p>} />
        </Routes>
      </main>
    </div>
  )
}
