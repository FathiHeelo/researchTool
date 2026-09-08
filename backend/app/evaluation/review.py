from sqlalchemy import select
from app.models.evaluation import ReviewDecision, GroundTruthValidation
from app.evaluation.ground_truth import validate_ground_truth
from app.evaluation.metrics import overall
from app.models.evaluation import EvaluationRun


def review_details(session, result, loaded=None):
    decisions = loaded[0] if loaded is not None else session.scalars(select(ReviewDecision).where(ReviewDecision.result_id == result.id).order_by(ReviewDecision.id)).all()
    state = decisions[-1].new_value if decisions else {'override_scores': {}, 'review_note': '', 'error_tags': result.error_tags}
    accepted = {**result.scores, **state['override_scores']}
    validation = loaded[1] if loaded is not None else session.scalar(select(GroundTruthValidation).where(GroundTruthValidation.result_id == result.id))
    if validation is None:
        validation = GroundTruthValidation(result_id=result.id, warnings=validate_ground_truth(result.snapshot.get('case', {}).get('expected_rule')))
        session.add(validation); session.commit()
    return {'automated_scores': result.scores, **state, 'accepted_scores': accepted,
            'provenance': result.evaluation.get('provenance'),
            'metric_configuration': (session.get(EvaluationRun, result.run_id).summary or {}).get('metric_configuration', []),
            'accepted_overall_accuracy': overall(accepted, (session.get(EvaluationRun, result.run_id).summary or {}).get('metric_configuration')),
            'audit_history': decisions, 'ground_truth_warnings': validation.warnings,
            'ground_truth_warning': bool(validation.warnings), 'ground_truth_warning_count': len(validation.warnings)}


def reviewed_results(session, results):
    """Batch-load audit/warning relationships instead of queries per response."""
    from collections import defaultdict
    ids = [r.id for r in results]
    decisions = defaultdict(list)
    validations = {}
    # Bound SQLite parameters for larger benchmarks.
    for start in range(0, len(ids), 500):
        chunk = ids[start:start+500]
        for decision in session.scalars(select(ReviewDecision).where(ReviewDecision.result_id.in_(chunk)).order_by(ReviewDecision.id)):
            decisions[decision.result_id].append(decision)
        for validation in session.scalars(select(GroundTruthValidation).where(GroundTruthValidation.result_id.in_(chunk))):
            validations[validation.result_id] = validation
    # Keep run objects alive in the identity map while computing accepted scores.
    runs = session.scalars(select(EvaluationRun).where(EvaluationRun.id.in_({r.run_id for r in results}))).all()
    return [(r, review_details(session, r, (decisions[r.id], validations.get(r.id)))) for r in results]
