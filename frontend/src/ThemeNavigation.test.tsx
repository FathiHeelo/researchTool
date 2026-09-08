// @vitest-environment jsdom
import {afterEach,expect,test,vi} from 'vitest'
import {cleanup,fireEvent,render,screen,within} from '@testing-library/react'
import {MemoryRouter} from 'react-router-dom'
import App from './App'
import {projectsApi,evaluationApi} from './api/client'
vi.mock('./components/datasets/DatasetUpload',()=>({DatasetUpload:()=> <input aria-label="Retained dataset state"/>}))
vi.mock('./components/datasets/ResearchDashboard',()=>({ResearchDashboard:()=> <h1>Research Overview Dashboard</h1>}))
vi.mock('./components/datasets/ResultsExplorer',()=>({ResultsExplorer:({selectedRunId}:{selectedRunId:string})=> <h1>Results for run {selectedRunId}</h1>}))
vi.mock('./components/datasets/ResearchAnalytics',()=>({ResearchAnalytics:({initialTab}:{initialTab:string})=> <h1>{initialTab}</h1>}))
afterEach(()=>{cleanup();vi.restoreAllMocks()})
test('approved sidebar switches workspace sections and retains dataset state',async()=>{
 vi.spyOn(projectsApi,'get').mockResolvedValue({id:1,name:'بحث',description:null,created_at:'',updated_at:''})
 vi.spyOn(evaluationApi,'list').mockResolvedValue([{id:4,status:'completed',processed_responses:1,total_responses:1,summary:{}}])
 render(<MemoryRouter initialEntries={['/projects/1']}><App/></MemoryRouter>)
 await screen.findByText('Research Overview Dashboard')
 const nav=within(screen.getByRole('navigation',{name:'Main navigation'}))
 expect(nav.getByText('Overview').getAttribute('aria-current')).toBe('page')
 expect(nav.getByText('Results').getAttribute('aria-current')).toBeNull()
 expect(nav.getByText('Projects').getAttribute('aria-current')).toBeNull()
 fireEvent.click(nav.getByText('Datasets'))
 fireEvent.change(screen.getByLabelText('Retained dataset state'),{target:{value:'kept'}})
 fireEvent.click(nav.getByText('Results'));await screen.findByText('Results for run')
 fireEvent.change(screen.getByLabelText('Workspace run'),{target:{value:'4'}})
 await screen.findByText('Results for run 4')
 fireEvent.click(nav.getByText('Datasets'))
 expect((screen.getByLabelText('Retained dataset state') as HTMLInputElement).value).toBe('kept')
 fireEvent.click(nav.getByText('Metrics'));await screen.findByRole('heading',{name:'Metrics'})
})
