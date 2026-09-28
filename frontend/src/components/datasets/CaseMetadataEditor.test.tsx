// @vitest-environment jsdom
import {useState} from 'react'
import {afterEach,expect,test} from 'vitest'
import {cleanup,fireEvent,render,screen,within} from '@testing-library/react'
import type {NormalizedImport} from '../../api/client'
import {CaseMetadataEditor} from './CaseMetadataEditor'

afterEach(cleanup)

const imported: NormalizedImport = {
  cases: [
    {id:'row_2',case_id:'C1',requirement:'First requirement',expected_rule:'rule()',metadata:[{label:'Few-shot Prompt',value:'Example A'}]},
    {id:'row_3',case_id:'C2',requirement:'Second requirement',expected_rule:'rule()',metadata:[{label:'Few-shot Prompt',value:'Example B'}]},
  ],
  models:[{id:'model'}],
  responses:[
    {case_reference:'row_2',model:'model',generated_output:'rule()',metadata:[{label:'Few-shot Prompt',value:'Example A'}]},
    {case_reference:'row_3',model:'model',generated_output:'rule()',metadata:[{label:'Few-shot Prompt',value:'Example B'}]},
  ],
}

function Harness() {
  const [value,setValue]=useState(imported)
  return <><CaseMetadataEditor value={value} onChange={setValue}/><pre data-testid="state">{JSON.stringify(value)}</pre></>
}

test('creates an arbitrary field without changing existing metadata',()=>{
  render(<Harness/>)
  fireEvent.click(screen.getByText('+ Create Metadata Field'))
  fireEvent.change(screen.getByLabelText('New metadata field name'),{target:{value:'Researcher DQ Axis'}})
  fireEvent.click(screen.getByText('Create'))
  const field=screen.getByLabelText('Case metadata field') as HTMLSelectElement
  expect(field.value).toBe('Researcher DQ Axis')
  expect(within(field).getByRole('option',{name:'Researcher DQ Axis'})).toBeTruthy()
  const state=JSON.parse(screen.getByTestId('state').textContent || '{}') as NormalizedImport
  expect(state.cases.every(item=>item.metadata.some(entry=>entry.label==='Researcher DQ Axis'&&entry.value===null))).toBe(true)
  expect(state.responses.every(item=>item.metadata?.some(entry=>entry.label==='Researcher DQ Axis'&&entry.value===null))).toBe(true)
  expect(state.cases.map(item=>item.metadata.find(entry=>entry.label==='Few-shot Prompt')?.value)).toEqual(['Example A','Example B'])
})

test('assigns a new field individually and in bulk while preserving existing metadata',()=>{
  render(<Harness/>)
  fireEvent.click(screen.getByText('+ Create Metadata Field'))
  fireEvent.change(screen.getByLabelText('New metadata field name'),{target:{value:'Data Quality Dimension'}})
  fireEvent.click(screen.getByText('Create'))
  fireEvent.change(screen.getByLabelText('Metadata for case C1'),{target:{value:'Novel label'}})
  let state=JSON.parse(screen.getByTestId('state').textContent || '{}') as NormalizedImport
  expect(state.cases[0].metadata.find(entry=>entry.label==='Data Quality Dimension')?.value).toBe('Novel label')
  expect(state.responses[0].metadata?.find(entry=>entry.label==='Data Quality Dimension')?.value).toBe('Novel label')
  fireEvent.change(screen.getByLabelText('Case metadata search'),{target:{value:'Second requirement'}})
  expect(within(screen.getByRole('table',{name:'Case metadata'})).queryByText('C1')).toBeNull()
  fireEvent.click(screen.getByText('Select filtered'))
  fireEvent.change(screen.getByLabelText('Bulk metadata value'),{target:{value:'Bulk dimension'}})
  fireEvent.click(screen.getByText('Assign to selected (1)'))
  state=JSON.parse(screen.getByTestId('state').textContent || '{}') as NormalizedImport
  expect(state.cases[1].metadata.find(entry=>entry.label==='Data Quality Dimension')?.value).toBe('Bulk dimension')
  expect(state.responses[1].metadata?.find(entry=>entry.label==='Data Quality Dimension')?.value).toBe('Bulk dimension')
  expect(state.cases.map(item=>item.metadata.find(entry=>entry.label==='Few-shot Prompt')?.value)).toEqual(['Example A','Example B'])
  fireEvent.click(screen.getByText('Save case metadata'))
  expect(screen.getByRole('status').textContent).toContain('saved')
})
