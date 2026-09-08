// @vitest-environment jsdom
import {afterEach,expect,test,vi} from 'vitest'
import {cleanup,fireEvent,render,screen,within} from '@testing-library/react'
import {MemoryRouter,Route,Routes} from 'react-router-dom'
import {ResearchReportPage} from './ResearchReportPage'
import {ReportActions} from '../components/datasets/ReportPrimitives'
import * as report from '../api/report'
import {analystSections} from '../api/research'
import type {ReportData} from '../api/report'

afterEach(()=>{cleanup();vi.restoreAllMocks()})
const fixture = {
 project:{id:1,name:'بحث علمي',description:null,created_at:'2026-01-01',updated_at:'2026-01-01'},
 run:{id:2,status:'completed',processed_responses:1,total_responses:1,summary:{evaluator_version:'1.1',metric_configuration:[{key:'custom',name:'Custom metric',enabled:true,weight:100,min_score:0,max_score:1}]}},
 dashboard:{total_unique_cases:1,total_evaluated_responses:1,total_models:1,average_overall_accuracy:100,reliability:100,hallucination_rate:0,ground_truth_warning_results:1,error_tag_counts:{},models:[{model:'نموذج α',response_count:1,average_overall_accuracy:100,average_component_scores:{custom:1},reliability:100,hallucination_rate:0}]},
 analysis:{strategies:[],strategy_deltas:[],dimensions:[],agreement:[],hallucinated_functions:{}},
 analyst:{scope:{},...Object.fromEntries(Object.keys(analystSections).map(k=>[k,[]]))},
 included:true,generated:'2026-01-01T00:00:00Z',
 details:[{id:1,case_id:'حالة ١',model:'نموذج α',snapshot:{case:{requirement:'متطلب',expected_rule:'expected()'},response:{generated_output:'generated()'}},automated_scores:{custom:0},override_scores:{custom:1},accepted_scores:{custom:1},accepted_overall_accuracy:100,error_tags:[],notes:[],review_note:'Reviewed',hallucination_detected:false,ground_truth_warning:true,ground_truth_warnings:[{warning_type:'REFERENCE_WARNING',severity:'warning',message:'Existing warning'}]}]
} as unknown as ReportData
function page() {return render(<MemoryRouter initialEntries={['/projects/1/runs/2/report']}><Routes><Route path='/projects/:projectId/runs/:runId/report' element={<ResearchReportPage/>}/></Routes></MemoryRouter>)}

test('full report shows accepted scores, dynamic model, Unicode, warnings and unavailable optional sections',async()=>{
 vi.spyOn(report,'loadReport').mockResolvedValue(fixture);const print=vi.spyOn(window,'print').mockImplementation(()=>{})
 page();await screen.findByRole('article',{name:'Research Evaluation Report'})
 expect(screen.getByText('بحث علمي')).toBeTruthy()
 expect(within(screen.getByRole('table',{name:'Model performance'})).getByText('نموذج α')).toBeTruthy()
 expect(screen.getByText('Existing warning')).toBeTruthy()
 expect(screen.getByText('generated()')).toBeTruthy()
 expect(screen.getByText('Accepted Overall Accuracy: 100.0%',{exact:false})).toBeTruthy()
 expect(screen.getAllByText(/Not Available — no data/).length).toBeGreaterThan(0)
 fireEvent.click(screen.getByText('Print / Save as PDF'));expect(print).toHaveBeenCalledTimes(1)
 fireEvent.click(screen.getByLabelText('Detailed Results'));expect(screen.queryByText('generated()')).toBeNull()
 fireEvent.click(screen.getByLabelText('Ground Truth'));expect(screen.queryByText('Existing warning')).toBeNull()
})

test('report loading and failure prevent printing incomplete data and allow retry',async()=>{
 const load=vi.spyOn(report,'loadReport').mockRejectedValueOnce(new Error('network')).mockResolvedValueOnce(fixture)
 page();expect(screen.getByRole('status')).toBeTruthy();expect(screen.queryByText('Print / Save as PDF')).toBeNull()
 await screen.findByRole('alert');fireEvent.click(screen.getByText('Retry report'));await screen.findByText('Print / Save as PDF');expect(load).toHaveBeenCalledTimes(2)
})

test('report actions require a completed run',()=>{
 const {rerender}=render(<ReportActions projectId='1'/>);expect(screen.queryByText('View Full Report')).toBeNull()
 rerender(<ReportActions projectId='1' run={{id:2,status:'running',processed_responses:0,total_responses:1,summary:{}}}/>);expect(screen.queryByText('Print Report')).toBeNull()
 rerender(<ReportActions projectId='1' run={{id:2,status:'completed',processed_responses:1,total_responses:1,summary:{}}}/>);expect(screen.getByText('View Full Report').getAttribute('href')).toBe('/projects/1/runs/2/report')
})
