// @vitest-environment jsdom
import {useState} from 'react'
import {afterEach,expect,test} from 'vitest'
import {cleanup,fireEvent,render,screen,within} from '@testing-library/react'
import type {NormalizedImport} from '../../api/client'
import {CaseMetadataEditor} from './CaseMetadataEditor'

afterEach(cleanup)

const imported: NormalizedImport = {
  cases: [
    {id:'row_2',case_id:'C1',requirement:'First requirement',expected_rule:'rule()',metadata:[]},
    {id:'row_3',case_id:'C2',requirement:'Second requirement',expected_rule:'rule()',metadata:[]},
  ],
  models:[{id:'model'}],
  responses:[
    {case_reference:'row_2',model:'model',generated_output:'rule()',metadata:[]},
    {case_reference:'row_3',model:'model',generated_output:'rule()',metadata:[]},
  ],
}

function Harness() {
  const [value,setValue]=useState(imported)
  return <><CaseMetadataEditor value={value} onChange={setValue}/><pre data-testid="state">{JSON.stringify(value)}</pre></>
}

test('filters cases and applies arbitrary metadata individually and in bulk',()=>{
  render(<Harness/>)
  fireEvent.change(screen.getByLabelText('Case metadata field'),{target:{value:'Researcher DQ Axis'}})
  fireEvent.change(screen.getByLabelText('Metadata for case C1'),{target:{value:'Novel label'}})
  let state=JSON.parse(screen.getByTestId('state').textContent || '{}') as NormalizedImport
  expect(state.cases[0].metadata[0]).toMatchObject({label:'Researcher DQ Axis',value:'Novel label'})
  expect(state.responses[0].metadata?.[0]).toMatchObject({label:'Researcher DQ Axis',value:'Novel label'})
  fireEvent.change(screen.getByLabelText('Case metadata search'),{target:{value:'Second requirement'}})
  expect(within(screen.getByRole('table',{name:'Case metadata'})).queryByText('C1')).toBeNull()
  fireEvent.click(screen.getByText('Select filtered'))
  fireEvent.change(screen.getByLabelText('Bulk metadata value'),{target:{value:'Bulk dimension'}})
  fireEvent.click(screen.getByText('Assign to selected (1)'))
  state=JSON.parse(screen.getByTestId('state').textContent || '{}') as NormalizedImport
  expect(state.cases[1].metadata[0].value).toBe('Bulk dimension')
  expect(state.responses[1].metadata?.[0].value).toBe('Bulk dimension')
  fireEvent.click(screen.getByText('Save case metadata'))
  expect(screen.getByRole('status').textContent).toContain('saved')
})
