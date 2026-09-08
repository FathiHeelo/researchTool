from typing import Annotated
from fastapi import APIRouter, Depends, Query, HTTPException, Response
from sqlalchemy.orm import Session
from app.db import get_session
from app.api.runs import get_run, find_result
from app.evaluation.raters import RaterRequest, rater_view, save_rater, agreement
from app.evaluation.replication import audit_run, replication_package
from app.models.project import Project

router=APIRouter(prefix='/projects/{project_id}/runs',tags=['research reproducibility'])
DB=Annotated[Session,Depends(get_session)]


@router.get('/{run_id}/results/{result_id}/raters')
def read_raters(project_id:int,run_id:int,result_id:int,session:DB,rater_label:str=Query(min_length=1,max_length=160),independent_review_mode:bool=True):
    return rater_view(session,find_result(session,project_id,run_id,result_id),rater_label.strip(),independent_review_mode)


@router.post('/{run_id}/results/{result_id}/raters')
def write_rater(project_id:int,run_id:int,result_id:int,data:RaterRequest,session:DB):
    return save_rater(session,find_result(session,project_id,run_id,result_id),data)


@router.get('/{run_id}/inter-rater')
def inter_rater(project_id:int,run_id:int,session:DB,rater_a:str='',rater_b:str='',metric:str|None=None):
    get_run(session,project_id,run_id)
    if rater_a and rater_a==rater_b:raise HTTPException(400,'Choose two distinct rater labels')
    return agreement(session,run_id,rater_a,rater_b,metric)


@router.get('/{run_id}/reproducibility-audit')
def audit(project_id:int,run_id:int,session:DB,include_ground_truth_warnings:bool=True):
    return audit_run(session,get_run(session,project_id,run_id),include_ground_truth_warnings)


@router.get('/{run_id}/replication')
def package(project_id:int,run_id:int,session:DB,include_ground_truth_warnings:bool=True,
            include_analysis:bool=True,include_statistics:bool=False,include_xlsx:bool=True):
    run=get_run(session,project_id,run_id)
    try:
        content=replication_package(session,session.get(Project,project_id),run,include_ground_truth_warnings,include_analysis,include_statistics,include_xlsx)
    except Exception:
        import logging
        logging.getLogger(__name__).exception('Replication generation failed for run %s',run_id)
        raise HTTPException(500,'Replication package could not be generated. Please retry.')
    return Response(content,media_type='application/zip',headers={'Content-Disposition':f'attachment; filename="replication-run-{run_id}.zip"'})
