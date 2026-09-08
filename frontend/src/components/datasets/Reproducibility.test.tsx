// @vitest-environment jsdom
import {afterEach,expect,test,vi} from 'vitest'
import {cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react'
import {RaterReview} from './RaterReview'
import {InterRaterReview} from './InterRaterReview'
import {ReplicationPackage} from './ReplicationPackage'
import {RunEvaluation} from './RunEvaluation'
import {reproducibilityApi} from '../../api/reproducibility'
import {evaluationApi} from '../../api/client'
import {protocolApi} from '../../api/experiments'

afterEach(()=>{cleanup();vi.restoreAllMocks();vi.unstubAllGlobals()})

test('independent rater labels hide decisions and save explicit scores',async()=>{
  const view={result_id:1,case_id:'C',model:'Dynamic',automated_scores:{custom:1},accepted_scores:null,metric_configuration:[],other_reviews_hidden:true,own_review:null,raters:[],audit_history:[],snapshot:{}}
  vi.spyOn(reproducibilityApi,'rater').mockResolvedValue(view)
  const save=vi.spyOn(reproducibilityApi,'saveRater').mockResolvedValue({...view,other_reviews_hidden:false})
  render(<RaterReview projectId="1" runId={1} resultId={1}/> )
  fireEvent.change(screen.getByLabelText('Rater label'),{target:{value:'Expert Ω'}})
  fireEvent.click(screen.getByText('Open rater review'))
  await screen.findByText(/Other rater decisions are hidden/)
  expect(screen.getByText('Hidden')).toBeTruthy()
  fireEvent.change(screen.getByLabelText('Rater score custom'),{target:{value:'.5'}})
  fireEvent.change(screen.getByLabelText('Rater reason'),{target:{value:'Checked source'}})
  fireEvent.click(screen.getByText('Save independent review'))
  await screen.findByText(/Independent review saved/)
  expect(save.mock.calls[0][3]).toMatchObject({rater_label:'Expert Ω',scores:{custom:.5},expected_revision:0})
})

test('agreement selection, summary and disagreement evidence',async()=>{
  const api=vi.spyOn(reproducibilityApi,'agreement').mockResolvedValue({raters:['Expert Ω','Reviewer B'],total_jointly_reviewed_results:2,comparable_results:2,incomplete_results:0,exact_agreement_count:1,exact_agreement_rate:50,disagreement_count:1,disagreement_rate:50,status:'available',metrics:[{metric:'custom',matched_n:2,kappa:.5,status:'ok'}],disagreements:[{case_id:'C1',model:'New Model',metric:'custom',automated:1,rater_a:0,rater_b:1,difference:1,snapshot:{requirement:'Evidence preserved'},review_a:{reason:'Reason A'},review_b:{note:'Note B'}}]})
  render(<InterRaterReview projectId="1" run="1"/> )
  await screen.findByText(/Jointly reviewed: 2/)
  fireEvent.change(screen.getByLabelText('Rater A'),{target:{value:'Expert Ω'}})
  await waitFor(()=>expect(api.mock.calls.at(-1)?.[2]).toContain('rater_a=Expert'))
  await screen.findByText('C1')
  fireEvent.click(screen.getByText('C1'))
  expect(screen.getByText(/Evidence preserved/)).toBeTruthy()
  expect(screen.getByText(/Exact agreement: 1/)).toBeTruthy()
})

test('insufficient pairs and request errors remain readable',async()=>{
  const api=vi.spyOn(reproducibilityApi,'agreement').mockResolvedValue({raters:[],total_jointly_reviewed_results:0,comparable_results:0,incomplete_results:0,exact_agreement_count:0,exact_agreement_rate:null,disagreement_count:0,disagreement_rate:null,status:'insufficient_data',metrics:[],disagreements:[]})
  render(<InterRaterReview projectId="1" run="1"/> )
  await screen.findByText(/Insufficient paired reviews/)
  api.mockRejectedValue(new Error('network'))
  fireEvent.click(screen.getByText('Refresh rater agreement'))
  expect(await screen.findByRole('alert')).toBeTruthy()
})

test('incremental baseline and reuse summary',async()=>{
  vi.spyOn(protocolApi,'list').mockResolvedValue([])
  const run={id:1,status:'completed',processed_responses:4,total_responses:4,summary:{reused_count:3,reevaluated_count:1,failed_count:0}}
  vi.spyOn(evaluationApi,'list').mockResolvedValue([run])
  const start=vi.spyOn(evaluationApi,'run').mockResolvedValue({...run,id:2})
  render(<RunEvaluation projectId="1" imported={{cases:[{}],models:[{}],responses:[{}]}}/> )
  fireEvent.click(screen.getByLabelText('Re-evaluate Changed Cases Only'))
  await screen.findByText(/Run 1.*completed/)
  expect((screen.getByText('Run Evaluation') as HTMLButtonElement).disabled).toBe(true)
  fireEvent.change(screen.getByLabelText('Baseline Run'),{target:{value:'1'}})
  fireEvent.click(screen.getByText('Run Evaluation'))
  await screen.findByText(/Reused: 3/)
  expect(start.mock.calls[0][2]).toMatchObject({mode:'CHANGED_ONLY',baseline_run_id:1})
})

test('unavailable baseline leaves full mode available',async()=>{
  vi.spyOn(protocolApi,'list').mockResolvedValue([])
  vi.spyOn(evaluationApi,'list').mockResolvedValue([])
  render(<RunEvaluation projectId="1" imported={{cases:[],models:[],responses:[]}}/> )
  fireEvent.click(screen.getByLabelText('Re-evaluate Changed Cases Only'))
  await screen.findByText(/No completed baseline runs/)
  fireEvent.click(screen.getByLabelText('Full Evaluation'))
  expect(screen.queryByLabelText('Baseline Run')).toBeNull()
})

test('audit warnings, generation and download',async()=>{
  vi.spyOn(reproducibilityApi,'audit').mockResolvedValue({status:'READY_WITH_WARNINGS',checks:[{key:'evaluator_version',passed:true}],warnings:['Legacy metadata unavailable'],selected_results:4,filtered_results:0})
  const generate=vi.spyOn(reproducibilityApi,'package').mockResolvedValue(new Blob(['zip']))
  Object.defineProperty(URL,'createObjectURL',{configurable:true,value:vi.fn(()=> 'blob:test')})
  Object.defineProperty(URL,'revokeObjectURL',{configurable:true,value:vi.fn()})
  render(<ReplicationPackage projectId="1" run="1" included={true}/> )
  await screen.findByText(/Audit: READY_WITH_WARNINGS/)
  expect(screen.getByText(/Legacy metadata unavailable/)).toBeTruthy()
  fireEvent.click(screen.getByText('Generate Replication Package'))
  const download=await screen.findByText('Download ZIP')
  expect(download.getAttribute('href')).toBe('blob:test')
  expect(generate).toHaveBeenCalledTimes(1)
  fireEvent.click(screen.getByLabelText('Descriptive analyses'))
  expect(screen.queryByText('Download ZIP')).toBeNull()
})
