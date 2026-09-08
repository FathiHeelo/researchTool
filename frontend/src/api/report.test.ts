import {afterEach,expect,test,vi} from 'vitest'
import * as client from './client'
import {researchApi} from './research'
import {loadReport} from './report'
afterEach(()=>vi.restoreAllMocks())
test('report loads every page and accepted review with bounded requests in order',async()=>{
 vi.spyOn(client.projectsApi,'get').mockResolvedValue({id:1,name:'Test',description:null,created_at:'',updated_at:''})
 vi.spyOn(client.evaluationApi,'dashboard').mockResolvedValue({} as never)
 vi.spyOn(researchApi,'analysis').mockResolvedValue({} as never)
 vi.spyOn(researchApi,'analyst').mockResolvedValue({} as never)
 const request=vi.spyOn(client,'apiRequest').mockImplementation(async(path)=>{
  if(path.endsWith('/runs/2'))return {id:2,status:'completed',processed_responses:101,summary:{}} as never
  return {id:Number(path.split('/').at(-2)),accepted_scores:{custom:1}} as never
 })
 const results=vi.spyOn(client.evaluationApi,'results').mockImplementation(async(_p,_r,q)=>({total:101,models:[],items:Array.from({length:q.includes('page=1&')?100:1},(_,i)=>({id:q.includes('page=1&')?i+1:101}))} as never))
 const data=await loadReport('1','2',new AbortController().signal,()=>{})
 expect(results).toHaveBeenCalledTimes(2);expect(request).toHaveBeenCalledTimes(102)
 expect(data.details.map(r=>r.id)).toEqual(Array.from({length:101},(_,i)=>i+1))
 expect(data.details[100].accepted_scores.custom).toBe(1)
})
