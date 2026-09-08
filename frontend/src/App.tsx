import { Link, NavLink, Route, Routes, useLocation, useMatch } from 'react-router-dom'
import { HomePage } from './pages/HomePage'
import { ProjectsPage } from './pages/ProjectsPage'
import { ResearchReportPage } from './pages/ResearchReportPage'
import { ProjectPage } from './pages/ProjectPage'
import { ThemeIcon } from './components/ThemeIcon'

const navigation = [['overview','Overview','dashboard'],['dataset','Datasets','table'],['evaluation','Evaluation','play'],['results','Results','results'],['research','Research Analysis','chart'],['ground-truth','Ground Truth','shield'],['metrics','Metrics','activity'],['protocols','Protocols','file'],['export','Reports & Export','file']] as const
export default function App() {
  const project = useMatch('/projects/:projectId/*')
  const location=useLocation()
  const view = location.pathname.endsWith('/report') ? 'export' : new URLSearchParams(location.search).get('view') || 'overview'
  const root = project ? `/projects/${project.params.projectId}` : '/projects'
  return <div className="app-shell stitch-shell">
    <a className="skip-link" href="#main-content">Skip to content</a>
    <aside className="stitch-sidebar no-print">
      <NavLink to="/" className="stitch-brand"><span className="brand-mark"><ThemeIcon name="shield"/></span><span><strong>DQ-LLM Evaluator</strong><small>Scientific Bench</small></span></NavLink>
      <NavLink className="primary-action new-benchmark" to={project?`${root}?view=dataset`:'/projects'}><ThemeIcon name="play"/>New Benchmark Run</NavLink>
      <nav aria-label="Main navigation"><NavLink to="/projects" end className={!project&&location.pathname==='/projects'?'is-active':''}><ThemeIcon name="folder"/>Projects</NavLink>
        {project && navigation.map(([id,label,icon])=><Link key={id} to={`${root}?view=${id}${new URLSearchParams(location.search).get("run") ? `&run=${encodeURIComponent(new URLSearchParams(location.search).get("run")!)}` : ""}`} className={view===id&&!location.pathname.endsWith('/report')?'is-active':''} aria-current={view===id?'page':undefined}><ThemeIcon name={icon}/>{label}</Link>)}
        {!project&&<NavLink to="/" end><ThemeIcon name="dashboard"/>Overview</NavLink>}
      </nav>
      <div className="sidebar-foot"><small>EVALUATION BENCH</small><p>Research workspace</p><NavLink to="/projects"><ThemeIcon name="folder"/>Manage projects</NavLink></div>
    </aside>
    <main id="main-content" className="stitch-main"><Routes>
      <Route path="/" element={<HomePage/>}/><Route path="/projects" element={<ProjectsPage/>}/>
      <Route path="/projects/:projectId/runs/:runId/report" element={<ResearchReportPage/>}/>
      <Route path="/projects/:projectId" element={<ProjectPage/>}/>
      <Route path="*" element={<p>Page not found. <NavLink to="/">Return home</NavLink></p>}/>
    </Routes></main>
  </div>
}
