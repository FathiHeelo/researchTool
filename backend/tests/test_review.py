import pytest
from test_runs import client, benchmark
from app.evaluation.ground_truth import validate_ground_truth


def test_review_preserves_automated_and_history(client):
    client.post('/projects/1/runs', json=benchmark())
    url = '/projects/1/runs/1/results/1/review'
    before = client.get(url).json()
    assert before['accepted_scores'] == before['automated_scores']
    assert client.post(url, json={'override_scores': {'semantic': 0.5}}).status_code == 400
    first = client.post(url, json={'override_scores': {'semantic': 0.5}, 'reason': 'Research review', 'review_note': 'note', 'error_tags': ['CUSTOM_TAG']}).json()
    assert first['automated_scores'] == before['automated_scores']
    assert first['accepted_scores']['semantic'] == 0.5
    assert first['accepted_scores']['syntax'] == before['automated_scores']['syntax']
    second = client.post(url, json={'override_scores': {'semantic': 0}, 'reason': 'Reconsidered'}).json()
    assert len(second['audit_history']) == 2
    assert second['audit_history'][1]['previous_value']['override_scores']['semantic'] == 0.5
    assert second['review_note'] == 'note'
    assert second['error_tags'] == ['CUSTOM_TAG']
    assert len(client.get('/projects/1/runs/1/results/1/history').json()) == 2


def test_dynamic_metric(client, monkeypatch):
    from app.evaluation import batch
    original = batch.evaluate_pair
    def dynamic(a, b):
        result = original(a, b); result['component_scores']['researcher_defined'] = 0.5; return result
    monkeypatch.setattr(batch, 'evaluate_pair', dynamic)
    client.post('/projects/1/runs', json=benchmark())
    response = client.post('/projects/1/runs/1/results/1/review', json={'override_scores': {'researcher_defined': 1}, 'reason': 'Validated'})
    assert response.status_code == 200
    assert response.json()['accepted_scores']['researcher_defined'] == 1


@pytest.mark.parametrize('source,kind', [('', 'EMPTY_EXPECTED_RULE'), ('!!!', 'INVALID_SYNTAX'), ('expect_invented()', 'UNKNOWN_EXPECTATION'), ('expect_column_to_exist("a", bad=1)', 'INVALID_PARAMETER'), ('expect_column_to_exist()', 'MISSING_REQUIRED_PARAMETER')])
def test_ground_truth(source, kind):
    assert kind in {warning['warning_type'] for warning in validate_ground_truth(source)}


def test_valid_reference():
    assert validate_ground_truth('expect_column_to_exist("a")') == []


def test_warning_persisted_and_result_kept(client):
    data = benchmark(); data['cases'][0]['expected_rule'] = 'expect_invented()'
    client.post('/projects/1/runs', json=data)
    result = client.get('/projects/1/runs/1/results').json()
    assert result['total'] == 4
    assert result['items'][0]['ground_truth_warning']
    warnings = client.get('/projects/1/runs/1/ground-truth-warnings?warning_type=UNKNOWN_EXPECTATION&severity=warning').json()
    assert len(warnings) == 2
