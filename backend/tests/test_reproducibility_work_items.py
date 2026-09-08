import hashlib
import io
import json
import zipfile
import pytest
from test_runs import client, benchmark
from app.evaluation.raters import metric_agreement
from app.evaluation import batch, incremental
from app.evaluation.replication import sanitize


def start(client, data=None):
    response = client.post('/projects/1/runs', json=data or benchmark())
    assert response.status_code == 201, response.text
    return response.json()


def test_independent_reviews_and_audit(client):
    start(client)
    base = '/projects/1/runs/1/results/1'
    before = client.get(base+'/review').json()
    def save(label, score, revision=0):
        return client.post(base+'/raters', json={'rater_label':label,'scores':{'semantic':score},'reason':'Evidence checked','expected_revision':revision})
    assert save('Researcher A', 0).status_code == 200
    hidden = client.get(base+'/raters?rater_label=Researcher B').json()
    assert hidden['raters'] == [] and hidden['accepted_scores'] is None
    assert save('Researcher B', 1).status_code == 200
    assert save('Researcher A', .5).status_code == 409
    changed = save('Researcher A', .5, 1).json()
    assert changed['own_review']['revision'] == 2
    assert len(changed['audit_history']) == 3
    assert client.get(base+'/review').json()['accepted_scores'] == before['accepted_scores']
    comparison = client.get('/projects/1/runs/1/inter-rater?rater_a=Researcher A&rater_b=Researcher B').json()
    assert comparison['disagreement_count'] == 1
    assert comparison['disagreements'][0]['review_a']['reason'] == 'Evidence checked'
    assert comparison['metrics'][0]['status'] == 'insufficient_data'
    assert client.get('/projects/2/runs/1/inter-rater').status_code == 404


@pytest.mark.parametrize('a,b,config,status,kappa', [
    ([0,1,0,1],[0,1,1,1],{},'ok',.5),
    ([0,0],[0,0],{},'undefined',None),
    ([],[],{},'insufficient_data',None),
    ([.2,.4],[.3,.5],{},'not_applicable',None),
    ([0,1],[0,2],{'allowed_values':[0,1]},'incompatible_configuration',None),
])
def test_agreement_edge_cases(a,b,config,status,kappa):
    result = metric_agreement(a,b,config)
    assert result['status'] == status
    assert result['kappa'] == kappa


def test_ordered_kappa():
    result = metric_agreement([0,.5,1],[0,1,1],{'score_type':'ordinal','allowed_values':[0,.5,1]})
    assert result['kappa_type'] == 'linear weighted Cohen'
    assert result['kappa'] == pytest.approx(2/3)


def test_incremental_reuses_automated_only(client, monkeypatch):
    start(client)
    client.post('/projects/1/runs/1/results/1/review',json={'override_scores':{'semantic':0},'reason':'Accepted review'})
    original = batch.evaluate_pair
    calls=[]
    def evaluate(*args):
        calls.append(args)
        return original(*args)
    monkeypatch.setattr(batch,'evaluate_pair',evaluate)
    data=benchmark();data.update(mode='CHANGED_ONLY',baseline_run_id=1)
    run=start(client,data)
    assert run['summary']['reused_count']==4 and calls==[]
    result=client.get('/projects/1/runs/2/results').json()['items'][0]
    assert result['accepted_scores']==result['automated_scores']
    assert result['provenance']['source_run_id']==1
    assert result['provenance']['change_reasons']==[]
    data['responses'][0]['generated_output']='expect_column_to_exist("b")'
    run=start(client,data)
    assert run['summary']['reused_count']==3 and len(calls)==1
    monkeypatch.setattr(incremental,'EVALUATOR_VERSION','test-next')
    run=start(client,data)
    assert run['summary']['reevaluated_count']==4


def test_incremental_invalid_baseline(client):
    data=benchmark();data['mode']='CHANGED_ONLY'
    assert client.post('/projects/1/runs',json=data).status_code==422
    data['baseline_run_id']=99
    assert client.post('/projects/1/runs',json=data).status_code==404


def test_package_manifest_and_no_evaluation(client, monkeypatch):
    start(client)
    def forbidden(*args):raise AssertionError('Must not evaluate during export')
    monkeypatch.setattr(batch,'evaluate_pair',forbidden)
    audit=client.get('/projects/1/runs/1/reproducibility-audit')
    assert audit.status_code==200
    assert audit.json()['status'] in ('READY','READY_WITH_WARNINGS')
    response=client.get('/projects/1/runs/1/replication')
    assert response.status_code==200,response.text
    with zipfile.ZipFile(io.BytesIO(response.content)) as archive:
        manifest=json.loads(archive.read('replication_package/manifest.json'))
        for item in manifest['files']:
            content=archive.read(item['path'])
            assert hashlib.sha256(content).hexdigest()==item['sha256']
            assert len(content)==item['size']
        assert 'replication_package/data/benchmark.csv' in archive.namelist()
        assert 'replication_package/exports/research_results.xlsx' in archive.namelist()
        assert b'Future Model' in archive.read('replication_package/README.md')
        assert b'Evaluation Provenance' in archive.read('replication_package/data/detailed_results.csv')


def test_package_optional_and_redaction(client):
    start(client)
    response=client.get('/projects/1/runs/1/replication?include_analysis=false&include_xlsx=false')
    assert response.status_code==200
    with zipfile.ZipFile(io.BytesIO(response.content)) as archive:
        assert not any('/analysis/' in p or p.endswith('.xlsx') for p in archive.namelist())
    cleaned=sanitize({'api_key':'secret-value','metadata':[{'label':'password','value':'private'}],'path':r'C:\Users\researcher\data.csv'})
    assert 'secret-value' not in str(cleaned) and 'private' not in str(cleaned) and 'C:\\Users' not in str(cleaned)


@pytest.mark.parametrize('field,reason', [('requirement','requirement_changed'),('expected_rule','expected_rule_changed'),('model_output','model_output_changed'),('metric_configuration','metric_configuration_changed'),('evaluator_configuration','evaluator_configuration_changed')])
def test_fingerprint_effective_changes(field,reason):
    from copy import deepcopy
    before=incremental.evaluation_inputs({'requirement':'r','expected_rule':'e'},{'generated_output':'g'},[])
    after=deepcopy(before)
    after[field]=({'equivalence_version':'new'} if field=='evaluator_configuration' else [{'key':'arbitrary'}] if field=='metric_configuration' else 'changed')
    assert incremental.fingerprint(before)!=incremental.fingerprint(after)
    assert reason in incremental.change_reasons(before,after)
    assert incremental.fingerprint(before)==incremental.fingerprint(dict(reversed(list(before.items()))))
    assert before==incremental.evaluation_inputs({'requirement':'r','expected_rule':'e','id':999,'timestamp':'different'},{'generated_output':'g','id':12},[])


def test_full_evaluates_all_and_dynamic_missing_pairs(client,monkeypatch):
    original=batch.evaluate_pair;calls=[]
    def custom(*args):
        calls.append(args);value=original(*args);value['component_scores']['custom_metric']=1;return value
    monkeypatch.setattr(batch,'evaluate_pair',custom)
    start(client)
    assert len(calls)==4
    base='/projects/1/runs/1/results/1/raters'
    for label,scores in [('Arbitrary Ω',{'custom_metric':1}),('Other',{})]:
        assert client.post(base,json={'rater_label':label,'scores':scores,'reason':'Checked'}).status_code==200
    result=client.get('/projects/1/runs/1/inter-rater?rater_a=Arbitrary Ω&rater_b=Other').json()
    assert result['comparable_results']==0 and result['metrics']==[]
    assert client.post(base,json={'rater_label':'Other','scores':{'custom_metric':1},'reason':'Completed','expected_revision':1}).status_code==200
    result=client.get('/projects/1/runs/1/inter-rater?rater_a=Arbitrary Ω&rater_b=Other').json()
    assert result['exact_agreement_count']==1 and result['metrics'][0]['metric']=='custom_metric'


def test_package_ready_legacy_warnings_and_determinism(client):
    from app import db
    from app.models.evaluation import EvaluationRun
    from app.models.project import Project
    from app.evaluation.replication import replication_package, audit_run
    start(client)
    with db.SessionLocal() as session:
        run=session.get(EvaluationRun,1);project=session.get(Project,1)
        assert audit_run(session,run)['status']=='READY'
        first=replication_package(session,project,run,generated_at='2026-01-01T00:00:00+00:00')
        second=replication_package(session,project,run,generated_at='2026-01-01T00:00:00+00:00')
        assert first==second
        with zipfile.ZipFile(io.BytesIO(first)) as archive:
            assert b'arbitrary' in archive.read('replication_package/data/benchmark.csv')
            assert json.loads(archive.read('replication_package/configuration/metric_configuration.json'))==run.summary['metric_configuration']
            assert json.loads(archive.read('replication_package/configuration/evaluator_version.json'))['evaluator_version']==incremental.EVALUATOR_VERSION
        run.summary={};session.commit()
        assert audit_run(session,run)['status']=='READY_WITH_WARNINGS'
