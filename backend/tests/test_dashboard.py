from test_runs import client, benchmark


def dashboard(client, query=''):
    return client.get(f'/projects/1/runs/dashboard/summary{query}').json()


def test_dashboard_empty_dataset(client):
    data = dashboard(client)
    assert data['total_runs'] == 0
    assert data['total_evaluated_responses'] == 0
    assert data['models'] == []
    assert data['reliability'] == 0


def test_dashboard_model_averages_reliability_hallucination_and_errors(client):
    client.post('/projects/1/runs', json=benchmark())
    data = dashboard(client)
    assert data['total_runs'] == 1
    assert data['total_evaluated_responses'] == 4
    assert data['total_unique_cases'] == 2
    assert data['total_models'] == 2
    assert data['reliability'] == 50
    assert data['hallucination_count'] == 2
    assert data['hallucination_rate'] == 50
    assert data['error_tag_counts']['UNKNOWN_FUNCTION'] == 2
    assert data['most_common_error_tags'][0] == {'error_tag': 'UNKNOWN_FUNCTION', 'count': 2}
    by_model = {item['model']: item for item in data['models']}
    assert by_model['Future Model']['response_count'] == 2
    assert by_model['Future Model']['average_overall_accuracy'] == 100
    assert by_model['Future Model']['reliability'] == 100
    assert by_model['Another']['hallucination_rate'] == 100


def test_dashboard_uses_accepted_override_values(client):
    client.post('/projects/1/runs', json=benchmark())
    client.post('/projects/1/runs/1/results/1/review', json={'override_scores': {'semantic': 0}, 'reason': 'Research correction'})
    data = dashboard(client, '?model=Future%20Model')
    assert data['total_evaluated_responses'] == 2
    assert data['models'][0]['average_component_scores']['semantic'] == 0.5
    assert data['models'][0]['average_overall_accuracy'] < 100


def test_dashboard_ground_truth_warning_count(client):
    data = benchmark()
    data['cases'][0]['expected_rule'] = 'expect_invented()'
    client.post('/projects/1/runs', json=data)
    data = dashboard(client)
    assert data['ground_truth_warning_results'] == 2
    assert data['ground_truth_warning_cases'] == 1


def test_dashboard_filters(client):
    client.post('/projects/1/runs', json=benchmark())
    second = benchmark()
    second['models'] = [{'id': 'model-x', 'label': 'Research Model X'}]
    second['responses'] = [{'case_reference': f'row_{i}', 'model': 'model-x', 'source_column_name': 'model-x', 'generated_output': 'expect_column_to_exist("a")'} for i in range(2)]
    client.post('/projects/1/runs', json=second)
    run_filtered = dashboard(client, '?run_id=2')
    assert run_filtered['total_runs'] == 1
    assert run_filtered['total_evaluated_responses'] == 2
    model_filtered = dashboard(client, '?model=Research%20Model%20X')
    assert model_filtered['total_models'] == 1
    assert model_filtered['models'][0]['model'] == 'Research Model X'
    metadata_filtered = dashboard(client, '?metadata_key=arbitrary&metadata_value=context')
    assert metadata_filtered['total_evaluated_responses'] == 6
