from collections import Counter, defaultdict
from sqlalchemy import select
from sqlalchemy.orm import Session
from app.models.evaluation import EvaluationResult, EvaluationRun
from app.evaluation.review import reviewed_results
from app.schemas.dashboard import DashboardSummary, ModelDashboardSummary


def _pct(count: int, total: int) -> float:
    return round(count / total * 100, 2) if total else 0


def _average(values: list[float]) -> float | None:
    return round(sum(values) / len(values), 4) if values else None


def _metadata_matches(result: EvaluationResult, key: str | None, value: str | None) -> bool:
    if not key:
        return True
    metadata = result.snapshot.get('case', {}).get('metadata', [])
    if not isinstance(metadata, list):
        return False
    for entry in metadata:
        if not isinstance(entry, dict):
            continue
        entry_key = entry.get('label', entry.get('key'))
        if entry_key == key and (value is None or str(entry.get('value')) == value):
            return True
    return False


def dashboard_summary(session: Session, project_id: int, run_id: int | None = None, model: str | None = None,
                      metadata_key: str | None = None, metadata_value: str | None = None,
                      include_ground_truth_warnings: bool = True) -> DashboardSummary:
    run_query = select(EvaluationRun.id).where(EvaluationRun.project_id == project_id)
    if run_id is not None:
        run_query = run_query.where(EvaluationRun.id == run_id)
    run_ids = session.scalars(run_query).all()

    result_query = select(EvaluationResult).where(EvaluationResult.run_id.in_(run_ids)) if run_ids else select(EvaluationResult).where(False)
    if model:
        result_query = result_query.where(EvaluationResult.model == model)
    results = [result for result in session.scalars(result_query).all() if _metadata_matches(result, metadata_key, metadata_value)]

    accepted_overalls: list[float] = []
    reliability_success = 0
    hallucinations = 0
    perfect = partial = failed = 0
    cases: set[str] = set()
    models: set[str] = set()
    error_counts: Counter[str] = Counter()
    warning_results = 0
    warning_cases: set[str] = set()
    by_model: dict[str, dict] = defaultdict(lambda: {'count': 0, 'overalls': [], 'metrics': defaultdict(list), 'reliable': 0, 'eligible': 0, 'hallucinations': 0})

    reviewed = reviewed_results(session, results)
    excluded = [(r,d) for r,d in reviewed if not include_ground_truth_warnings and d['ground_truth_warning']]
    reviewed = [(r,d) for r,d in reviewed if include_ground_truth_warnings or not d['ground_truth_warning']]
    for result, details in reviewed:
        accepted_scores = details['accepted_scores']
        accepted_overall = details['accepted_overall_accuracy']
        if accepted_overall is not None:
            accepted_overalls.append(accepted_overall)
        execution = accepted_scores.get('execution')
        if execution == 1:
            reliability_success += 1
        if result.hallucination_detected:
            hallucinations += 1
        if accepted_overall == 100:
            perfect += 1
        elif accepted_overall is None or accepted_overall == 0:
            failed += 1
        else:
            partial += 1
        cases.add(result.case_id)
        models.add(result.model)
        error_counts.update(list(dict.fromkeys(details['error_tags'])))
        if details['ground_truth_warnings']:
            warning_results += 1
            cases.add(result.case_id)
            warning_cases.add(result.case_id)

        item = by_model[result.model]
        item['count'] += 1
        item['hallucinations'] += 1 if result.hallucination_detected else 0
        item['reliable'] += 1 if execution == 1 else 0
        item['eligible'] += isinstance(execution, (int, float))
        if accepted_overall is not None:
            item['overalls'].append(accepted_overall)
        for metric, score in accepted_scores.items():
            if isinstance(score, (int, float)):
                item['metrics'][metric].append(score)

    model_summaries = []
    for name in sorted(by_model):
        item = by_model[name]
        model_summaries.append(ModelDashboardSummary(
            model=name,
            response_count=item['count'],
            average_overall_accuracy=_average(item['overalls']),
            average_component_scores={metric: _average(values) for metric, values in sorted(item['metrics'].items()) if values},
            reliability=_pct(item['reliable'], item['eligible']),
            hallucination_rate=_pct(item['hallucinations'], item['count']),
        ))

    total = len(reviewed)
    return DashboardSummary(
        total_runs=len(run_ids),
        total_evaluated_responses=total,
        total_unique_cases=len(cases),
        total_models=len(models),
        average_overall_accuracy=_average(accepted_overalls),
        reliability=_pct(reliability_success, sum(isinstance(d['accepted_scores'].get('execution'), (int, float)) for _,d in reviewed)),
        hallucination_count=hallucinations,
        hallucination_rate=_pct(hallucinations, total),
        perfect_results=perfect,
        partial_results=partial,
        failed_results=failed,
        error_tag_counts=dict(sorted(error_counts.items())),
        most_common_error_tags=[{'error_tag': tag, 'count': count} for tag, count in error_counts.most_common(5)],
        ground_truth_warning_results=warning_results,
        ground_truth_warning_cases=len(warning_cases),
        models=model_summaries,
        include_ground_truth_warnings=include_ground_truth_warnings,
        filtered_results=len(excluded),
        filtered_cases=len({r.case_id for r,d in excluded}),
    )
