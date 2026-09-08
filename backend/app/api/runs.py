from typing import Annotated
from typing import Literal
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select, func, or_
from sqlalchemy.orm import Session
from app.db import get_session
from app.models.project import Project
from app.models.evaluation import EvaluationRun, EvaluationResult
from app.schemas.run import ImportedBenchmark
from app.evaluation.batch import run_batch
from app.evaluation.review import review_details, reviewed_results
from app.evaluation.dashboard import dashboard_summary
from app.models.evaluation import ReviewDecision
from pydantic import BaseModel, Field, field_validator
from fastapi.encoders import jsonable_encoder
import math
from fastapi import Response
from app.evaluation.metrics import MetricProfile, ProjectMetricProfile, current_profile, defaults
from app.evaluation.research import analytics
from app.evaluation.analyst import research_summary
from app.evaluation.export import export_run
from app.evaluation.comparisons import variant_comparison
from app.evaluation.statistics import statistical_comparison

router = APIRouter(prefix='/projects/{project_id}/runs', tags=['evaluation'])
DB = Annotated[Session, Depends(get_session)]

def project_exists(session, project_id):
    if session.get(Project, project_id) is None: raise HTTPException(404, 'Project not found')

def get_run(session, project_id, run_id):
    project_exists(session, project_id)
    run = session.get(EvaluationRun, run_id)
    if run is None or run.project_id != project_id: raise HTTPException(404, 'Run not found')
    return run

@router.post('', status_code=201)
def create_run(project_id: int, data: ImportedBenchmark, session: DB):
    project_exists(session, project_id)
    from app.api.protocols import protocol
    from app.evaluation.protocols import study_default
    snapshot = None
    if data.protocol_id is not None:
        if data.use_study_default: raise HTTPException(400, 'Choose either a saved protocol or study defaults')
        selected = protocol(session, project_id, data.protocol_id)
        if data.protocol_version is None or selected.version != data.protocol_version:
            raise HTTPException(409, 'Protocol version changed or was not supplied. Reload protocols before starting.')
        snapshot = {'protocol_id': selected.id, 'protocol_version': selected.version, 'name': selected.name,
                    'configuration': selected.configuration}
    elif data.use_study_default:
        snapshot = {'protocol_id': None, 'protocol_version': 1, 'name': 'Study Default', 'configuration': study_default()}
    baseline = None
    if data.mode=='CHANGED_ONLY':
        baseline=get_run(session,project_id,data.baseline_run_id)
        if baseline.status not in ('completed','completed_with_errors'):
            raise HTTPException(400,'Choose a completed baseline run')
    return run_batch(session, project_id, data, snapshot, baseline)

@router.get('')
def list_runs(project_id: int, session: DB):
    project_exists(session, project_id)
    return session.scalars(select(EvaluationRun).where(EvaluationRun.project_id == project_id).order_by(EvaluationRun.id.desc())).all()

@router.get('/dashboard/summary')
def dashboard(project_id: int, session: DB, run_id: int | None = None, model: str | None = None,
              metadata_key: str | None = None, metadata_value: str | None = None, include_ground_truth_warnings: bool = True):
    project_exists(session, project_id)
    if run_id is not None:
        get_run(session, project_id, run_id)
    return dashboard_summary(session, project_id, run_id, model, metadata_key, metadata_value, include_ground_truth_warnings)

@router.get('/{run_id}')
def read_run(project_id: int, run_id: int, session: DB):
    return get_run(session, project_id, run_id)


@router.get('/settings/metrics')
def metric_settings(project_id: int, session: DB):
    project_exists(session, project_id)
    return {'metrics': current_profile(session, project_id)}


@router.post('/settings/metrics')
def save_metrics(project_id: int, data: MetricProfile, session: DB):
    project_exists(session, project_id)
    profile = session.get(ProjectMetricProfile, project_id)
    if profile is None:
        profile = ProjectMetricProfile(project_id=project_id); session.add(profile)
    profile.metrics = [m.model_dump() for m in data.metrics]
    session.commit()
    return {'metrics': profile.metrics}


@router.post('/settings/metrics/reset')
def reset_metrics(project_id: int, session: DB):
    return save_metrics(project_id, MetricProfile(metrics=defaults()), session)


@router.get('/dashboard/research')
def research_analytics(project_id: int, session: DB, run_id: int | None = None, model: str | None = None,
                       include_ground_truth_warnings: bool = True, strategy_key: str | None = None,
                       dimension_key: str | None = None, group_key: str | None = None):
    project_exists(session, project_id)
    if run_id is not None: get_run(session, project_id, run_id)
    return analytics(session, project_id, run_id, model, include_ground_truth_warnings, strategy_key, dimension_key, group_key)


@router.get('/dashboard/analyst-summary')
def analyst_summary(project_id: int, session: DB, run_id: int | None = None, model: str | None = None,
                    include_ground_truth_warnings: bool = True, strategy_key: str | None = None,
                    dimension_key: str | None = None, variant_key: str | None = None):
    project_exists(session, project_id)
    if run_id is not None: get_run(session, project_id, run_id)
    scope = dict(run_id=run_id, model=model, include_ground_truth_warnings=include_ground_truth_warnings,
                 strategy_key=strategy_key, dimension_key=dimension_key)
    result = research_summary(analytics(session, project_id, **scope), {'project_id': project_id, **scope, 'variant_key': variant_key})
    if variant_key:
        from app.evaluation.analyst import variant_findings
        result['strategy_findings'].extend(variant_findings(variant_comparison(session, project_id, run_id, model, variant_key, include_ground_truth_warnings)))
    return result


@router.get('/dashboard/variants')
def variants(project_id: int, session: DB, run_id: int | None = None, model: str | None = None,
             metadata_key: str | None = None, include_ground_truth_warnings: bool = True):
    project_exists(session, project_id)
    if run_id is not None: get_run(session, project_id, run_id)
    return variant_comparison(session, project_id, run_id, model, metadata_key, include_ground_truth_warnings)


@router.get('/dashboard/statistics')
def statistics(project_id: int, session: DB, run_id: int | None = None, model: str | None = None,
               comparison_type: Literal['models', 'strategies', 'variants'] = 'models',
               metric: Literal['overall_accuracy', 'execution', 'hallucination'] = 'overall_accuracy',
               metadata_key: str | None = None, groups: Annotated[list[str] | None, Query()] = None,
               include_ground_truth_warnings: bool = True, enabled: bool = False,
               alpha: float = Query(.05, gt=0, lt=1), correction: Literal['none', 'holm'] = 'holm'):
    project_exists(session, project_id)
    if run_id is not None: get_run(session, project_id, run_id)
    if comparison_type != 'models' and (not model or not metadata_key):
        raise HTTPException(400, 'Choose a model and metadata key for within-model comparisons')
    if groups is not None and len(set(groups)) < 2: raise HTTPException(400, 'Choose at least two distinct groups')
    try:
        return statistical_comparison(session, project_id, run_id, model, comparison_type, metric, metadata_key,
                                      groups, include_ground_truth_warnings, enabled, alpha, correction)
    except ValueError as error:
        raise HTTPException(400, str(error))


@router.get('/{run_id}/export')
def export_results(project_id: int, run_id: int, session: DB, format: str = 'xlsx',
                   include_ground_truth_warnings: bool = True, strategy_key: str | None = None, dimension_key: str | None = None):
    run = get_run(session, project_id, run_id)
    if format not in ('csv', 'xlsx'): raise HTTPException(400, 'Choose CSV or XLSX export')
    try:
        content = export_run(session, session.get(Project, project_id), run, format, include_ground_truth_warnings, strategy_key, dimension_key)
    except ValueError as error:
        raise HTTPException(400, str(error))
    except Exception:
        import logging
        logging.getLogger(__name__).exception('Research export failed for run %s', run.id)
        raise HTTPException(500, 'Export could not be generated. Please retry.')
    media = 'text/csv; charset=utf-8' if format == 'csv' else 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    return Response(content, media_type=media, headers={'Content-Disposition': f'attachment; filename="run-{run.id}.{format}"'})

@router.get('/{run_id}/results')
def results(project_id: int, run_id: int, session: DB, page: int = Query(1, ge=1), page_size: int = Query(20, ge=1, le=100),
            model: str | None = None, min_score: float | None = Query(None, ge=0, le=100), max_score: float | None = Query(None, ge=0, le=100),
            error_tag: str | None = None, hallucination: bool | None = None, search: str = '', sort: str = 'id', descending: bool = False):
    get_run(session, project_id, run_id)
    if min_score is not None and max_score is not None and min_score > max_score: raise HTTPException(400, 'Invalid score range')
    query = select(EvaluationResult).where(EvaluationResult.run_id == run_id)
    if model is not None: query = query.where(EvaluationResult.model == model)
    if min_score is not None: query = query.where(EvaluationResult.overall_accuracy >= min_score)
    if max_score is not None: query = query.where(EvaluationResult.overall_accuracy <= max_score)
    if hallucination is not None: query = query.where(EvaluationResult.hallucination_detected == hallucination)
    if error_tag:
        tags = func.json_each(EvaluationResult.error_tags).table_valued('value')
        query = query.where(select(1).select_from(tags).where(tags.c.value == error_tag).exists())
    if search: query = query.where(or_(EvaluationResult.case_id.contains(search, autoescape=True), EvaluationResult.requirement.contains(search, autoescape=True)))
    sort_columns = {'id': EvaluationResult.id, 'model': EvaluationResult.model, 'case_id': EvaluationResult.case_id, 'overall_accuracy': EvaluationResult.overall_accuracy}
    if sort not in sort_columns: raise HTTPException(400, 'Unsupported sort field')
    total = session.scalar(select(func.count()).select_from(query.subquery()))
    column = sort_columns[sort]
    rows = session.scalars(query.order_by(column.desc() if descending else column.asc(), EvaluationResult.id).offset((page-1)*page_size).limit(page_size)).all()
    models = session.scalars(select(EvaluationResult.model).where(EvaluationResult.run_id == run_id).distinct()).all()
    return {'items': [{**jsonable_encoder(row), **details} for row, details in reviewed_results(session, rows)], 'total': total, 'page': page, 'page_size': page_size, 'models': models}


def find_result(session, project_id, run_id, result_id):
    get_run(session, project_id, run_id)
    result = session.get(EvaluationResult, result_id)
    if result is None or result.run_id != run_id: raise HTTPException(404, 'Result not found')
    return result

class OverrideRequest(BaseModel):
    override_scores: dict[str, float] = Field(default_factory=dict)
    reason: str = ''
    actor: str = 'researcher'
    review_note: str | None = None
    error_tags: list[str] | None = None

    @field_validator('override_scores')
    @classmethod
    def score_range(cls, values):
        if any(not math.isfinite(value) for value in values.values()):
            raise ValueError('Scores must be finite')
        return values

@router.get('/{run_id}/results/{result_id}/review')
def read_review(project_id: int, run_id: int, result_id: int, session: DB):
    result = find_result(session, project_id, run_id, result_id)
    return {**jsonable_encoder(result), **review_details(session, result)}

@router.post('/{run_id}/results/{result_id}/review')
def save_review(project_id: int, run_id: int, result_id: int, data: OverrideRequest, session: DB):
    result = find_result(session, project_id, run_id, result_id)
    current = review_details(session, result)
    if any(key not in result.scores for key in data.override_scores): raise HTTPException(400, 'Unknown metric key for this result')
    configuration = {m['key']: m for m in (session.get(EvaluationRun, run_id).summary or {}).get('metric_configuration', [])}
    for key, value in data.override_scores.items():
        metric = configuration.get(key, {'min_score': 0, 'max_score': 1})
        if not metric['min_score'] <= value <= metric['max_score'] or (metric.get('allowed_values') is not None and value not in metric['allowed_values']):
            raise HTTPException(400, 'Override is outside the metric score scale')
    overrides = {**current['override_scores'], **data.override_scores}
    accepted = {**result.scores, **overrides}
    if accepted != current['accepted_scores'] and not data.reason.strip(): raise HTTPException(400, 'Researcher reason is required for score changes')
    previous = {key: current[key] for key in ('override_scores', 'review_note', 'error_tags')}
    state = {'override_scores': overrides, 'review_note': data.review_note if data.review_note is not None else current['review_note'],
             'error_tags': data.error_tags if data.error_tags is not None else current['error_tags']}
    session.add(ReviewDecision(result_id=result.id, actor=data.actor.strip() or 'researcher', reason=data.reason,
                              previous_value=previous, new_value=state))
    session.commit()
    return {**jsonable_encoder(result), **review_details(session, result)}

@router.get('/{run_id}/results/{result_id}/history')
def history(project_id: int, run_id: int, result_id: int, session: DB):
    return review_details(session, find_result(session, project_id, run_id, result_id))['audit_history']

@router.get('/{run_id}/ground-truth-warnings')
def warning_list(project_id: int, run_id: int, session: DB, warning_type: str | None = None, severity: str | None = None):
    get_run(session, project_id, run_id)
    entries = []
    for result, details in reviewed_results(session, session.scalars(select(EvaluationResult).where(EvaluationResult.run_id == run_id)).all()):
        for warning in details['ground_truth_warnings']:
            if (warning_type is None or warning['warning_type'] == warning_type) and (severity is None or warning['severity'] == severity):
                entries.append({'result_id': result.id, 'case_id': result.case_id, 'model': result.model, 'requirement': result.requirement, 'expected_rule': result.snapshot['case'].get('expected_rule'), **warning})
    return entries
