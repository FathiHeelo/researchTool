import copy
import pytest
from test_runs import client, benchmark
from app import db
from app.models.evaluation import EvaluationRun, EvaluationResult, GroundTruthValidation
from app.evaluation.metrics import MetricConfiguration
from app.evaluation.statistics import paired_test, holm

BASE='/projects/1/runs'
PROTOCOL='/projects/1/protocols'


def persist(observations):
    """case, model, variant, accuracy, execution, hallucination, warning."""
    with db.SessionLocal() as session:
        run=EvaluationRun(project_id=1,status='completed',total_responses=len(observations),summary={'metric_configuration':[MetricConfiguration(key='research score',name='Score',max_score=100).model_dump()]})
        session.add(run);session.flush()
        for case,model,variant,accuracy,execution,hallucination,warning in observations:
            r=EvaluationResult(run_id=run.id,case_id=case,model=model,requirement='Same requirement',
                snapshot={'case':{'expected_rule':'expect_column_to_exist("a")','metadata':[{'label':'تجربة Ω','value':variant}]},'response':{'generated_output':'expect_column_to_exist("a")'}},
                scores={'research score':accuracy,'execution':execution},overall_accuracy=accuracy,
                hallucination_detected=hallucination,hallucinated_functions=['expect_invented'] if hallucination else [],
                error_tags=[],notes=[],evaluation={})
            session.add(r);session.flush()
            session.add(GroundTruthValidation(result_id=r.id,warnings=[{'warning_type':'CUSTOM_WARNING','severity':'warning','message':'Review','details':{}}] if warning else []))
        session.commit();return run.id


def variants(client, **params):
    return client.get(BASE+'/dashboard/variants',params={'metadata_key':'تجربة Ω',**params})


def test_arbitrary_variants_matched_delta_and_unmatched(client):
    persist([('C1','Model Ω','revision x',40,0,True,False),('C1','Model Ω','revision y',70,1,False,False),('C2','Model Ω','revision x',100,1,False,False)])
    data=variants(client).json();pair=data['comparisons'][0]
    assert data['status']=='available' and pair['matched_case_count']==1
    assert pair['accuracy_delta_percentage_points']==30
    assert pair['reliability_delta']==100 and pair['hallucination_delta']==-100
    assert pair['unmatched_case_count']==1
    assert pair['component_differences']['research score']['delta']==30
    assert data['summaries'][0]['response_count']==2
    text=client.get(BASE+'/dashboard/analyst-summary',params={'variant_key':'تجربة Ω'}).json()
    finding=next(f for f in text['strategy_findings'] if f['finding_type']=='variant_delta')
    assert finding['value']==30 and 'associated with' in finding['text']


def test_three_variants_and_ground_truth_pair_exclusion(client):
    persist([('C1','Arbitrary','a',10,0,False,True),('C1','Arbitrary','b',20,1,False,False),('C1','Arbitrary','c',30,1,False,False)])
    assert len(variants(client).json()['comparisons'])==3
    data=variants(client,include_ground_truth_warnings=False).json()
    ab=next(c for c in data['comparisons'] if c['variant_a']=='a' and c['variant_b']=='b')
    assert ab['original_matched_count']==1 and ab['excluded_count']==1 and ab['matched_case_count']==0


def test_missing_and_ambiguous_variants(client):
    assert client.get(BASE+'/dashboard/variants').json()['status']=='unavailable'
    persist([('C1','A','x',10,1,False,False),('C1','A','x',20,1,False,False),('C1','A','y',30,1,False,False)])
    data=variants(client).json()
    assert data['comparisons'][0]['ambiguous_case_count']==1
    assert data['status']=='unavailable'
    assert variants(client,metadata_key='missing').json()['comparisons']==[]


def test_protocol_crud_duplicate_version_snapshot(client):
    config=client.get(PROTOCOL+'/defaults').json()['configuration']
    assert [m['weight'] for m in config['metrics']]==[25]*4
    config['variant_metadata_key']='تجربة Ω';config['statistics']={'enabled':True,'alpha':.02,'correction':'holm'}
    created=client.post(PROTOCOL,json={'name':'Protocol Ω','description':'reproducible','configuration':config})
    assert created.status_code==201
    p=created.json();pid=p['id']
    assert client.get(f'{PROTOCOL}/{pid}').json()['version']==1
    run=client.post(BASE,json={**benchmark(),'protocol_id':pid,'protocol_version':1}).json()
    snapshot=copy.deepcopy(run['summary'])
    config['metrics'][0]['weight']=40
    update=client.post(f'{PROTOCOL}/{pid}',json={'name':'Renamed','configuration':config,'expected_version':1})
    assert update.status_code==200 and update.json()['version']==2
    assert client.get(f'{BASE}/{run["id"]}').json()['summary']==snapshot
    assert snapshot['protocol_snapshot']['configuration']['statistics']['alpha']==.02
    assert client.post(BASE,json={**benchmark(),'protocol_id':pid,'protocol_version':1}).status_code==409
    assert client.post(f'{PROTOCOL}/{pid}',json={'name':'stale','configuration':config,'expected_version':1}).status_code==409
    duplicate=client.post(f'{PROTOCOL}/{pid}/duplicate').json()
    assert duplicate['version']==1 and duplicate['id']!=pid and duplicate['configuration']==config
    assert len(client.get(PROTOCOL).json())==2
    assert client.delete(f'{PROTOCOL}/{pid}').status_code==204
    assert client.get(f'{BASE}/{run["id"]}').json()['summary']==snapshot


def test_dynamic_protocol_metrics_default_and_validation(client):
    config=client.get(PROTOCOL+'/defaults').json()['configuration']
    config['metrics']=[{'key':'custom rubric','name':'Research Score','weight':7,'max_score':10}]
    p=client.post(PROTOCOL,json={'name':'Custom','configuration':config}).json()
    assert p['configuration']['metrics'][0]['key']=='custom rubric'
    default_run=client.post(BASE,json={**benchmark(),'use_study_default':True}).json()
    assert default_run['summary']['protocol_snapshot']['name']=='Study Default'
    assert default_run['summary']['protocol_id'] is None
    assert client.post(PROTOCOL,json={'name':'Bad','configuration':{**config,'outputs':['forbidden']}}).status_code==422
    assert client.get('/projects/99/protocols').status_code==404


def test_wilcoxon_reference_and_effect_size():
    differences=[6,8,14,16,23,24,28,29,41,-48,49,56,60,-67,75]
    data=paired_test([(0,d) for d in differences],'overall_accuracy')
    assert data['status']=='ok' and data['statistic']==24
    assert data['p_value']==pytest.approx(.041259765625)
    assert data['effect_size']==pytest.approx(.6)


@pytest.mark.parametrize('values',[[],[(1,2)],[(1,1)]*10,[(None,2)]*10,[(float('nan'),2)]*10,[(1,'bad')]*10])
def test_insufficient_identical_null_malformed(values):
    data=paired_test(values,'overall_accuracy')
    assert data['status']=='insufficient_data' and data['p_value'] is None


def test_holm_correction():
    assert holm([.01,.04,.03,None])==[.03,.06,.06,None]
    assert holm([.8,.9])==[1,1]


@pytest.mark.parametrize('metric',['execution','hallucination'])
def test_exact_mcnemar(metric):
    data=paired_test([(0,1)]*8+[(1,0)]*2+[(1,1)]*3,metric)
    assert data['status']=='ok' and data['matched_n']==13
    assert data['discordant_a0_b1']==8 and data['discordant_a1_b0']==2
    assert data['p_value']==pytest.approx(.109375)
    assert data['statistic']==2


def test_statistical_matching_filtering_and_correction(client):
    observations=[]
    for i in range(9):
        for model,score in [('Model Ω',10),('Other',30),('Third',60)]:
            observations.append((f'C{i}',model,'same',score,0 if model=='Model Ω' else 1,model=='Third',i==0))
    observations.append(('Unmatched','Model Ω','same',10,1,False,False))
    run=persist(observations)
    response=client.get(BASE+'/dashboard/statistics',params={'run_id':run,'enabled':True,'include_ground_truth_warnings':False})
    assert response.status_code==200,response.text
    data=response.json();assert len(data['comparisons'])==3 and data['family_size']==3
    for p in data['comparisons']:
        assert p['original_matched_count']==9 and p['excluded_count']==1 and p['final_matched_count']==8
        assert p['adjusted_p_value']>=p['raw_p_value']
    assert any(p['unmatched_case_count']==1 for p in data['comparisons'])
    for metric in ('execution','hallucination'):
        binary=client.get(BASE+'/dashboard/statistics',params={'run_id':run,'enabled':True,'metric':metric}).json()
        assert all(p['test_name']=='Exact McNemar' for p in binary['comparisons'])


@pytest.mark.parametrize('kind',['strategies','variants'])
def test_within_model_comparisons_dynamic_metadata(client,kind):
    persist([(f'C{i}','Novel model',v,score,1,False,False) for i in range(6) for v,score in [('A',10),('B',30)]])
    response=client.get(BASE+'/dashboard/statistics',params={'comparison_type':kind,'model':'Novel model','metadata_key':'تجربة Ω','enabled':True})
    assert response.status_code==200
    assert response.json()['comparisons'][0]['matched_n']==6
    assert response.json()['comparisons'][0]['status']=='ok'
    assert client.get(BASE+'/dashboard/statistics',params={'comparison_type':kind}).status_code==400
