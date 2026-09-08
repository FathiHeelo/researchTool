import {apiRequest,apiBaseUrl} from './client'
import type {ResearchRecord} from './research'
export interface RaterEvent {id:number;rater_label:string;revision:number;reason:string;created_at:string;new_value:{scores:Record<string,number>;note:string;error_tags:string[]}}
export interface RaterView {result_id:number;case_id:string;model:string;automated_scores:Record<string,number|null>;accepted_scores:Record<string,number|null>|null;metric_configuration:{key:string;min_score:number;max_score:number;allowed_values?:number[]|null}[];other_reviews_hidden:boolean;own_review:RaterEvent|null;raters:RaterEvent[];audit_history:RaterEvent[];snapshot:unknown}
export interface RaterAgreement {raters:string[];total_jointly_reviewed_results:number;comparable_results:number;incomplete_results:number;exact_agreement_count:number;exact_agreement_rate:number|null;disagreement_count:number;disagreement_rate:number|null;metrics:ResearchRecord[];disagreements:ResearchRecord[];status:string}
export interface ReproducibilityAudit {status:'READY'|'READY_WITH_WARNINGS';checks:{key:string;passed:boolean}[];warnings:string[];selected_results:number;filtered_results:number}
export const reproducibilityApi={
  rater:(project:string,run:number,result:number,label:string,independent:boolean)=>apiRequest<RaterView>(`/projects/${project}/runs/${run}/results/${result}/raters?${new URLSearchParams({rater_label:label,independent_review_mode:String(independent)})}`),
  saveRater:(project:string,run:number,result:number,data:unknown)=>apiRequest<RaterView>(`/projects/${project}/runs/${run}/results/${result}/raters`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)}),
  agreement:(project:string,run:string,query:string,signal?:AbortSignal)=>apiRequest<RaterAgreement>(`/projects/${project}/runs/${run}/inter-rater?${query}`,{signal}),
  audit:(project:string,run:string,included:boolean,signal?:AbortSignal)=>apiRequest<ReproducibilityAudit>(`/projects/${project}/runs/${run}/reproducibility-audit?include_ground_truth_warnings=${included}`,{signal}),
  package:async(project:string,run:string,query:string)=>{
    const response=await fetch(`${apiBaseUrl}/projects/${project}/runs/${run}/replication?${query}`)
    if(!response.ok)throw new Error('Unable to generate replication package. Please retry.')
    return response.blob()
  },
}
