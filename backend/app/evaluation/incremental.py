"""Explicit evaluator tokens and stable effective-input fingerprints."""
import hashlib
import json
from importlib.metadata import version, PackageNotFoundError

EVALUATOR_VERSION = '1.1.0'
EQUIVALENCE_VERSION = '1'


def versions():
    try: gx = version('great_expectations')
    except PackageNotFoundError: gx = 'unavailable'
    return {'evaluator_version':EVALUATOR_VERSION,'equivalence_version':EQUIVALENCE_VERSION,'gx_version':gx}


def evaluation_inputs(case, response, metrics, runtime=None):
    # Names, UI ordering, metadata, database IDs and timestamps do not affect evaluation.
    metric_fields=('key','enabled','weight','score_type','min_score','max_score','allowed_values','evaluation_mode')
    return {'requirement':str(case.get('requirement') or ''),'expected_rule':str(case.get('expected_rule') or ''),
            'model_output':str(response.get('generated_output') or ''),
            'metric_configuration':sorted([{k:m.get(k) for k in metric_fields} for m in metrics],key=lambda m:m['key']),
            'evaluator_configuration':runtime or versions()}


def fingerprint(inputs):
    return hashlib.sha256(json.dumps(inputs,sort_keys=True,separators=(',',':'),ensure_ascii=False,allow_nan=False).encode('utf-8')).hexdigest()


def identity(case, model, response):
    return (str(case.get('case_id',case.get('id',''))),str(model.get('label',model.get('id',''))),str(response.get('source_column_name','')))


def change_reasons(previous, current):
    if not previous:return ['baseline_fingerprint_missing']
    reasons=[]
    for field,reason in [('requirement','requirement_changed'),('expected_rule','expected_rule_changed'),('model_output','model_output_changed'),('metric_configuration','metric_configuration_changed')]:
        if previous.get(field)!=current.get(field):reasons.append(reason)
    a,b=previous.get('evaluator_configuration',{}),current['evaluator_configuration']
    if a.get('evaluator_version')!=b.get('evaluator_version'):reasons.append('evaluator_version_changed')
    if {k:v for k,v in a.items() if k!='evaluator_version'}!={k:v for k,v in b.items() if k!='evaluator_version'}:reasons.append('evaluator_configuration_changed')
    return reasons
