// @vitest-environment jsdom
import { afterEach, expect, test, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { experimentApi, protocolApi, type ProtocolConfiguration, type Protocol } from '../../api/experiments'
import { researchApi } from '../../api/research'
import { evaluationApi } from '../../api/client'
import { VariantComparison, StatisticalComparison } from './ExperimentComparisons'
import { EvaluationProtocols } from './EvaluationProtocols'
import { RunEvaluation } from './RunEvaluation'

afterEach(()=>{cleanup();vi.restoreAllMocks()})
const configuration:ProtocolConfiguration={metrics:[{key:'dynamic',name:'Custom',description:'',enabled:true,weight:25,score_type:'number',min_score:0,max_score:10,allowed_values:null,evaluation_mode:'manual',display_order:0}],include_ground_truth_warnings:true,analysis_metadata_keys:{},variant_metadata_key:null,statistics:{enabled:false,alpha:.05,correction:'holm'},evaluator_version:'1'}
const protocol:Protocol={id:3,name:'Protocol Ω',description:'Study',version:2,configuration}

test('variant comparison renders dynamic summary pairs and unavailable state',async()=>{
  const api=vi.spyOn(experimentApi,'variants').mockResolvedValue({metadata_key:'Custom axis',variants:['X','Y'],summaries:[{variant:'X',response_count:3}],comparisons:[{model:'Novel Ω',variant_a:'X',variant_b:'Y',matched_case_count:2,accuracy_delta_percentage_points:5}],status:'available',reason:null})
  const {rerender}=render(<VariantComparison projectId="1" query="metadata_key=Custom"/>)
  expect(screen.getByRole('status').textContent).toContain('Loading')
  expect(await screen.findByRole('table',{name:'Variant pairs'})).toBeTruthy()
  expect(within(screen.getByRole('table',{name:'Variant pairs'})).getByText('Novel Ω')).toBeTruthy()
  api.mockResolvedValue({metadata_key:null,variants:[],summaries:[],comparisons:[],status:'unavailable',reason:'Choose a variant metadata key.'})
  rerender(<VariantComparison projectId="1" query=""/>)
  expect(await screen.findByText('Choose a variant metadata key.')).toBeTruthy()
})

test('variant errors allow retry',async()=>{
  vi.spyOn(experimentApi,'variants').mockRejectedValue(new Error('offline'))
  render(<VariantComparison projectId="1" query=""/>)
  expect((await screen.findByRole('alert')).textContent).toContain('Unable to load variant')
  expect(screen.getByText('Retry variants')).toBeTruthy()
})

test('protocol selector sends ID and version before evaluation',async()=>{
  vi.spyOn(protocolApi,'list').mockResolvedValue([protocol])
  const run=vi.spyOn(evaluationApi,'run').mockResolvedValue({id:1,status:'completed',processed_responses:1,total_responses:1,summary:{}})
  render(<RunEvaluation projectId="1" imported={{cases:[{}],models:[{}],responses:[{}]}}/>)
  await screen.findByText('Protocol Ω — v2')
  fireEvent.change(screen.getByLabelText('Evaluation Protocol'),{target:{value:'3'}})
  fireEvent.click(screen.getByText('Run Evaluation'))
  await waitFor(()=>expect(run).toHaveBeenCalledWith('1',expect.anything(),{protocol_id:3,protocol_version:2}))
  expect((screen.getByLabelText('Evaluation Protocol') as HTMLSelectElement).disabled).toBe(true)
})

test('protocol settings save current configuration and version edits',async()=>{
  vi.spyOn(protocolApi,'list').mockResolvedValue([protocol])
  vi.spyOn(protocolApi,'defaults').mockResolvedValue({configuration})
  vi.spyOn(researchApi,'metrics').mockResolvedValue({metrics:configuration.metrics})
  const save=vi.spyOn(protocolApi,'save').mockResolvedValue({...protocol,version:3})
  render(<EvaluationProtocols projectId="1" analysisKeys={{strategy:'Arbitrary'}} variantKey="Revision" included={false} statistics={{enabled:true,alpha:.01,correction:'holm'}}/>)
  await screen.findByText('Protocol Ω — v2')
  fireEvent.change(screen.getByLabelText('Saved protocol'),{target:{value:'3'}})
  fireEvent.click(screen.getByText('Use current configuration'))
  await screen.findByText('Current project metrics and dashboard settings loaded into the draft.')
  fireEvent.change(screen.getByLabelText('Protocol name'),{target:{value:'Renamed'}})
  fireEvent.click(screen.getByText('Save new version / rename'))
  await screen.findByText('Saved version 3.')
  expect(save).toHaveBeenCalledWith('1',expect.objectContaining({name:'Renamed',expected_version:2,configuration:expect.objectContaining({variant_metadata_key:'Revision',include_ground_truth_warnings:false})}),3)
})

test('protocol duplicate and reset defaults',async()=>{
  vi.spyOn(protocolApi,'list').mockResolvedValue([protocol])
  const duplicate=vi.spyOn(protocolApi,'duplicate').mockResolvedValue({...protocol,id:4,version:1})
  vi.spyOn(protocolApi,'defaults').mockResolvedValue({configuration})
  render(<EvaluationProtocols projectId="1" analysisKeys={{}} variantKey="" included={true} statistics={configuration.statistics}/>)
  await screen.findByText('Protocol Ω — v2')
  fireEvent.change(screen.getByLabelText('Saved protocol'),{target:{value:'3'}})
  fireEvent.click(screen.getByText('Duplicate protocol'))
  await screen.findByText('Protocol duplicated.')
  expect(duplicate).toHaveBeenCalledWith('1',3)
  fireEvent.click(screen.getByText('Reset to study defaults'))
  expect(await screen.findByText('Study defaults loaded into draft; save to apply.')).toBeTruthy()
})

test('statistics show insufficient data counts and selected groups',async()=>{
  const api=vi.spyOn(experimentApi,'statistics').mockResolvedValue({groups:['Model Ω','Second'],comparisons:[{group_a:'Model Ω',group_b:'Second',status:'insufficient_data',matched_n:1,notes:['At least 6 complete pairs required.']}],status:'available',family_size:0,notes:['Descriptive only.'],correction:'holm'})
  render(<StatisticalComparison projectId="1" run="4" model="" strategyKey="" variantKey="" included={false} settings={{enabled:true,alpha:.05,correction:'holm'}} onSettings={()=>{}}/>)
  expect(await screen.findByText(/insufficient_data/)).toBeTruthy()
  expect(screen.getByText(/Statistical results supplement descriptive/)).toBeTruthy()
  fireEvent.click(screen.getByLabelText('Model Ω'));fireEvent.click(screen.getByLabelText('Second'))
  fireEvent.click(screen.getByText('Compare selected groups'))
  await waitFor(()=>expect(api.mock.calls.at(-1)?.[1]).toContain('groups=Model+%CE%A9&groups=Second'))
  expect(api.mock.calls.at(-1)?.[1]).toContain('include_ground_truth_warnings=false')
})

test('statistics unavailable context and network errors',async()=>{
  vi.spyOn(experimentApi,'statistics').mockRejectedValue(new Error('offline'))
  render(<StatisticalComparison projectId="1" run="" model="" strategyKey="" variantKey="" included={true} settings={configuration.statistics} onSettings={()=>{}}/>)
  expect((await screen.findByRole('alert')).textContent).toContain('Unable to load statistical')
  fireEvent.change(screen.getByLabelText('Comparison Type'),{target:{value:'variants'}})
  expect(await screen.findByText('Choose a model and the corresponding strategy/variant metadata key above.')).toBeTruthy()
})
