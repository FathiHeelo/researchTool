// @vitest-environment jsdom
import {afterEach,expect,test,vi} from 'vitest'
import {cleanup,fireEvent,render,screen} from '@testing-library/react'
import {DimensionDistribution} from './DimensionDistribution'
import {researchApi} from '../../api/research'
afterEach(()=>{cleanup();vi.restoreAllMocks()})
test('dimension metadata remains researcher selected and displays returned groups',async()=>{
 const load=vi.spyOn(researchApi,'analysis').mockResolvedValueOnce({metadata_keys:['Research category'],dimension_summary:[]} as never).mockResolvedValue({metadata_keys:['Research category'],dimension_summary:[{value:'دقة',average_overall_accuracy:87.5}]} as never)
 render(<DimensionDistribution projectId='1' runId='2' model='' included={true}/>)
 await screen.findByText('Choose dimension metadata to inspect its distribution.')
 fireEvent.change(screen.getByLabelText('Dashboard dimension metadata'),{target:{value:'Research category'}})
 await screen.findByText('دقة');expect(screen.getByText('87.5%')).toBeTruthy()
 expect(load.mock.calls.at(-1)?.[1]).toContain('dimension_key=Research+category')
})
