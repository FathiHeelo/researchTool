from app.models.evaluation import EvaluationRun, EvaluationResult
from app.models.project import utc_now
from app.evaluation.engine import evaluate_pair
from app.evaluation.ground_truth import validate_ground_truth
from app.models.evaluation import GroundTruthValidation
from app.evaluation.metrics import current_profile, overall
from app.evaluation.protocols import ProtocolConfiguration
from app.evaluation.incremental import versions, evaluation_inputs, fingerprint, identity, change_reasons
from sqlalchemy import select
from collections import defaultdict
from copy import deepcopy
import logging


def run_batch(session, project_id, benchmark, protocol_snapshot=None, baseline=None):
    protocol_snapshot = protocol_snapshot or {'protocol_id': None, 'protocol_version': 1, 'name': 'Current project configuration',
        'configuration': ProtocolConfiguration(metrics=current_profile(session, project_id)).model_dump()}
    configuration = protocol_snapshot['configuration']['metrics']
    runtime = versions()
    previous=defaultdict(list)
    if baseline is not None:
        for item in session.scalars(select(EvaluationResult).where(EvaluationResult.run_id==baseline.id).order_by(EvaluationResult.id)):
            previous[identity(item.snapshot.get('case',{}),item.snapshot.get('model',{}),item.snapshot.get('response',{}))].append(item)
    run = EvaluationRun(project_id=project_id, total_responses=len(benchmark.responses), summary={'metric_configuration': configuration,
        **runtime, 'protocol_id': protocol_snapshot['protocol_id'], 'protocol_version': protocol_snapshot['protocol_version'],
        'protocol_snapshot': protocol_snapshot,'mode':benchmark.mode,'baseline_run_id':baseline.id if baseline else None})
    session.add(run); session.commit(); session.refresh(run)
    run.status = 'running'; run.started_at = utc_now(); session.commit()
    failed = execution_failures = hallucinations = reused = reevaluated = 0
    accuracies = []
    try:
        cases = {item['id']: item for item in benchmark.cases}
        reference_warnings = {key: validate_ground_truth(case.get('expected_rule')) for key, case in cases.items()}
        models = {item['id']: item for item in benchmark.models}
        for response in benchmark.responses:
            case, model = cases[response['case_reference']], models[response['model']]
            inputs=evaluation_inputs(case,response,configuration,runtime)
            digest=fingerprint(inputs)
            candidates=previous.get(identity(case,model,response),[]) if benchmark.mode=='CHANGED_ONLY' else []
            source=next((p for p in candidates if p.evaluation.get('provenance',{}).get('fingerprint')==digest
                         and not any(e.get('code')=='EVALUATION_ERROR' for e in p.evaluation.get('errors',[]))),None)
            reasons=change_reasons(candidates[0].evaluation.get('provenance',{}).get('inputs'),inputs) if len(candidates)==1 else ['new_or_ambiguous_case']
            try:
                if source is not None:
                    output=deepcopy(source.evaluation);output.pop('provenance',None);reused+=1;reasons=[]
                else:
                    reevaluated+=1
                    output = evaluate_pair(str(case.get('expected_rule') or ''), str(response.get('generated_output') or ''))
            except Exception:
                failed += 1
                output = {'component_scores': {}, 'overall_accuracy': None, 'hallucination_detected': False,
                          'hallucinated_functions': [], 'errors': [{'code': 'EVALUATION_ERROR', 'detail': 'This response could not be evaluated'}],
                          'notes': ['Unexpected evaluator failure; remaining responses continued.']}
            scores = output['component_scores']
            for metric in configuration:
                scores.setdefault(metric['key'], None)
            output['overall_accuracy'] = overall(scores, configuration)
            output['provenance']={'evaluation_origin':'reused' if source else 'evaluated','fingerprint':digest,'inputs':inputs,
                'source_run_id':source.run_id if source else None,'source_result_id':source.id if source else None,
                'original_source_run_id':source.evaluation.get('provenance',{}).get('original_source_run_id') or source.run_id if source else None,
                'original_source_result_id':source.evaluation.get('provenance',{}).get('original_source_result_id') or source.id if source else None,
                'source_evaluator_version':source.evaluation.get('provenance',{}).get('inputs',{}).get('evaluator_configuration',{}).get('evaluator_version') if source else None,
                'evaluator_version':runtime['evaluator_version'],'change_reasons':[] if benchmark.mode=='FULL' or source else (reasons or ['baseline_failed'])}
            execution_failures += scores.get('execution') == 0
            hallucinations += bool(output['hallucination_detected'])
            if output['overall_accuracy'] is not None: accuracies.append(output['overall_accuracy'])
            result = EvaluationResult(run_id=run.id, snapshot={'case': case, 'model': model, 'response': response},
                model=str(model.get('label', model['id'])), case_id=str(case.get('case_id', case['id'])), requirement=str(case.get('requirement') or ''),
                scores=scores, overall_accuracy=output['overall_accuracy'], hallucination_detected=output['hallucination_detected'],
                hallucinated_functions=output['hallucinated_functions'], error_tags=[error['code'] for error in output['errors']], notes=output['notes'], evaluation=output)
            session.add(result); session.flush()
            session.add(GroundTruthValidation(result_id=result.id, warnings=reference_warnings[response['case_reference']]))
            run.processed_responses += 1
            session.commit()
        run.status = 'completed_with_errors' if failed else 'completed'
        run.failure_summary = f'{failed} responses failed unexpectedly' if failed else None
        run.summary = {**run.summary, 'total_evaluated': run.processed_responses, 'successful_evaluations': run.processed_responses - failed,
                       'reused_count':reused,'reevaluated_count':reevaluated,'failed_count':failed,
                       'reuse_percentage':reused/run.total_responses*100 if run.total_responses else 0,
                       'execution_failures': execution_failures, 'hallucinations': hallucinations,
                       'average_overall_accuracy': sum(accuracies) / len(accuracies) if accuracies else None}
    except Exception:
        logging.getLogger(__name__).exception('Evaluation run %s failed', run.id)
        session.rollback()
        run.status = 'failed'; run.failure_summary = 'Run preparation or result persistence failed. Contact the administrator to check backend logs and installed dependencies.'
    run.completed_at = utc_now(); session.commit(); session.refresh(run)
    return run
