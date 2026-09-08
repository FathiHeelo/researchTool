import io
import pytest
from openpyxl import load_workbook
from test_runs import client, benchmark
from app.evaluation.metrics import overall, defaults
from app.evaluation.engine import evaluate_pair
from app.evaluation.gx_registry import ExpectationRegistry

BASE = '/projects/1/runs'


def test_manual_metric_has_no_fabricated_automated_score(client):
    assert client.post(BASE + '/settings/metrics', json={'metrics': [{'key': 'human-defined', 'name': 'Human defined', 'evaluation_mode': 'manual', 'max_score': 10}]}).status_code == 200
    client.post(BASE, json=benchmark())
    row = client.get(BASE + '/1/results/1/review').json()
    assert row['automated_scores']['human-defined'] is None
    assert row['accepted_overall_accuracy'] is None
    row = client.post(BASE + '/1/results/1/review', json={'override_scores': {'human-defined': 8}, 'reason': 'Human measurement'}).json()
    assert row['accepted_overall_accuracy'] == 80
    assert row['automated_scores']['human-defined'] is None


def test_environment_dependent_is_not_hallucinated():
    registry = ExpectationRegistry(environment_dependent={'expect_external_custom'})
    result = evaluate_pair('expect_column_to_exist("a")', 'expect_external_custom()', registry)
    assert result['execution'] == 0
    assert not result['hallucination_detected']
    assert result['environment_dependent_functions'] == ['expect_external_custom']


@pytest.mark.parametrize('metadata', [None, 5, 'broken', [None, 5, {}], {'Arbitrary': 'value'}])
def test_malformed_optional_metadata_does_not_crash(client, metadata):
    data = benchmark(); data['cases'][0]['metadata'] = metadata
    client.post(BASE, json=data)
    assert client.get(BASE + '/dashboard/research?group_key=Arbitrary').status_code == 200
    assert client.get(BASE + '/1/export').status_code == 200


def test_null_scores_are_not_execution_failures(client, monkeypatch):
    from app.evaluation import batch
    original = batch.evaluate_pair
    def evaluator(a,b):
        output = original(a,b)
        if 'invented' in b: output['component_scores']['execution'] = None
        return output
    monkeypatch.setattr(batch, 'evaluate_pair', evaluator)
    client.post(BASE, json=benchmark())
    assert client.get(BASE + '/dashboard/research').json()['reliability'] == 100
    assert client.get(BASE + '/dashboard/summary').json()['reliability'] == 100


def test_repeated_runs_are_not_arbitrarily_paired(client):
    client.post(BASE, json=benchmark()); client.post(BASE, json=benchmark())
    data = client.get(BASE + '/dashboard/research').json()
    assert data['agreement'][0]['agreement_rate'] is None
    assert data['agreement'][0]['non_comparable_count'] == 2


def test_safe_workbook_control_characters_and_long_text(client):
    data = benchmark(); data['cases'][0]['requirement'] = 'text\x01tail'
    client.post(BASE, json=data)
    response = client.get(BASE + '/1/export')
    assert response.status_code == 200
    book = load_workbook(io.BytesIO(response.content))
    assert 'text\\u0001tail' in [c.value for c in book['Detailed Results'][2]]
    data['cases'][0]['requirement'] = 'x'*33000
    client.post(BASE, json=data)
    error = client.get(BASE + '/2/export')
    assert error.status_code == 400
    assert 'CSV' in error.json()['detail']
    assert client.get(BASE + '/2/export?format=csv').status_code == 200


def test_extreme_weights_do_not_overflow():
    metrics = defaults()
    for m in metrics: m['weight'] = 1e308
    assert overall({m['key']: 1 for m in metrics}, metrics) == 100
    assert overall({'x': None}) is None


def test_export_failure_is_readable(client, monkeypatch):
    from app.api import runs
    client.post(BASE, json=benchmark())
    def fail(*args, **kwargs): raise RuntimeError('private implementation details')
    monkeypatch.setattr(runs, 'export_run', fail)
    response = client.get(BASE + '/1/export')
    assert response.status_code == 500
    assert 'private' not in response.text


def test_agreement_rejects_unsupported_statements(client):
    data = benchmark()
    for r in data['responses']: r['generated_output'] = 'x = expect_column_to_exist("a")'
    client.post(BASE, json=data)
    result = client.get(BASE + '/dashboard/research').json()
    assert result['agreement'][0]['comparable_count'] == 0


def test_strategy_delta_rejects_conflicting_case_identity(client):
    data = benchmark()
    for i, case in enumerate(data['cases']):
        case['case_id'] = 'same-id'
        case['requirement'] = f'Different requirement {i}'
        case['metadata'] = [{'label': 'Experiment', 'value': str(i)}]
    client.post(BASE, json=data)
    result = client.get(BASE + '/dashboard/research?strategy_key=Experiment').json()
    assert all(d['delta'] is None and d['non_comparable_case_count'] == 1 for d in result['strategy_deltas'])
