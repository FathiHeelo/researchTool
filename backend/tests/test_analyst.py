import json
import pytest
from test_runs import client, benchmark
from app.evaluation.analyst import research_summary, SECTIONS

BASE = '/projects/1/runs'


def result(client, query=''):
    response = client.get(BASE + '/dashboard/analyst-summary' + query)
    assert response.status_code == 200, response.text
    return response.json()


def test_model_reliability_hallucination_error_and_evidence(client):
    client.post(BASE, json=benchmark())
    data = result(client)
    highest = next(f for f in data['overview'] if f['finding_type'] == 'highest_average_overall_accuracy')
    lowest = next(f for f in data['overview'] if f['finding_type'] == 'lowest_average_overall_accuracy')
    assert highest['metadata_context']['entities'] == ['Future Model']
    assert highest['value'] == 100 and highest['evidence_count'] == 2
    assert lowest['metadata_context']['entities'] == ['Another']
    reliability = next(f for f in data['overview'] if f['supporting_metric'] == 'reliability')
    assert reliability['value'] == 50 and reliability['evidence_count'] == 4
    hallucination = next(f for f in data['hallucination_findings'] if f['finding_type'] == 'highest_hallucination_rate')
    assert hallucination['value'] == 100
    assert any('expect_invented' in f['text'] for f in data['hallucination_findings'])
    assert any('UNKNOWN_FUNCTION' in f['text'] for f in data['error_findings'])
    assert any(f['finding_type'] == 'component_average' for f in data['model_findings'])
    assert any(f['finding_type'] == 'small_sample' for f in data['limitations'])
    for section in SECTIONS:
        assert all({'finding_type', 'title', 'text', 'supporting_metric', 'value', 'evidence_count'} <= set(f) for f in data[section])


def test_dynamic_strategy_dimension_and_matched_delta(client):
    data = benchmark()
    for i, case in enumerate(data['cases']):
        case['case_id'] = 'Matched'
        case['metadata'] = [{'label': 'تجربة', 'value': ['Ω approach', 'Δ approach'][i]}, {'label': 'Research Axis', 'value': ['Novel X', 'Novel Y'][i]}]
    client.post(BASE, json=data)
    client.post(BASE + '/1/results/1/review', json={'override_scores': {'semantic': 0}, 'reason': 'Checked'})
    summary = result(client, '?strategy_key=تجربة&dimension_key=Research%20Axis')
    assert any('Ω approach' in f['text'] for f in summary['strategy_findings'])
    delta = next(f for f in summary['strategy_findings'] if f['finding_type'] == 'matched_delta' and f['model'] == 'Future Model')
    assert abs(delta['value']) == 25 and delta['evidence_count'] == 1
    assert 'associated with' in delta['text'] and 'percentage-point' in delta['text']
    assert any('Novel X' in f['text'] for f in summary['dimension_findings'])
    assert any(f['finding_type'] == 'strategy_agreement' for f in summary['agreement_findings'])


@pytest.mark.parametrize('section', ['strategy_findings', 'dimension_findings'])
def test_missing_optional_metadata(client, section):
    client.post(BASE, json=benchmark())
    data = result(client)
    assert data[section][0]['finding_type'] == 'unavailable'
    assert data[section][0]['title'] == 'Not Available'


def test_ground_truth_include_exclude_counts(client):
    data = benchmark(); data['cases'][0]['expected_rule'] = 'expect_unknown_reference()'
    client.post(BASE, json=data)
    included = result(client)
    note = included['ground_truth_notes'][0]
    assert '1 case IDs' in note['text'] and 'included' in note['text']
    assert note['value'] == 2  # Existing persistence is per model response.
    assert any('UNKNOWN_EXPECTATION' in f['text'] for f in included['ground_truth_notes'])
    excluded = result(client, '?include_ground_truth_warnings=false')
    assert excluded['overview'][0]['value'] == 2
    assert 'excluded; 2 responses / 1 case IDs' in excluded['ground_truth_notes'][0]['text']
    assert excluded['ground_truth_notes'][0]['value'] == 2


def test_agreement_invalid_outputs_not_counted(client):
    data = benchmark()
    for response in data['responses']: response['generated_output'] = '!!!'
    client.post(BASE, json=data)
    summary = result(client)
    assert summary['agreement_findings'][0]['finding_type'] == 'unavailable'
    note = next(f for f in summary['limitations'] if f['finding_type'] == 'non_comparable')
    assert note['value'] == 2


def test_summary_uses_accepted_scores_and_run_filter(client):
    client.post(BASE, json=benchmark())
    client.post(BASE + '/1/results/1/review', json={'override_scores': {'semantic': 0}, 'reason': 'Accepted decision'})
    client.post(BASE, json=benchmark())
    summary = result(client, '?run_id=1&model=Future%20Model')
    overall = next(f for f in summary['overview'] if f['supporting_metric'] == 'average_overall_accuracy')
    assert overall['value'] == 87.5 and overall['evidence_count'] == 2
    assert summary['scope']['run_id'] == 1
    assert client.get(BASE + '/1/results/1/review').json()['automated_scores']['semantic'] == 1


def test_ties_are_retained(client):
    data = benchmark()
    for r in data['responses']: r['generated_output'] = 'expect_column_to_exist("a")'
    client.post(BASE, json=data)
    highest = next(f for f in result(client)['overview'] if f['finding_type'] == 'highest_average_overall_accuracy')
    assert set(highest['metadata_context']['entities']) == {'Future Model', 'Another'}
    assert '(tied)' in highest['text']


def test_empty_summary_and_missing_project(client):
    data = result(client)
    assert data['overview'][0]['evidence_count'] == 0
    assert not any(f['finding_type'].startswith('highest') for f in data['overview'])
    assert client.get('/projects/99/runs/dashboard/analyst-summary').status_code == 404
    assert client.get(BASE + '/dashboard/analyst-summary?run_id=999').status_code == 404


def test_no_unsupported_wording_and_deterministic(client):
    client.post(BASE, json=benchmark())
    data = result(client)
    assert data == result(client)
    text = ' '.join(f['text'] for key in SECTIONS for f in data[key]).lower()
    for forbidden in ('statistically significant', 'significant improvement', 'caused', 'causal effect', 'statistically better', 'excellent', 'terrible'):
        assert forbidden not in text
