from sqlalchemy import select

from app import db
from app.evaluation import batch
from app.models.evaluation import EvaluationResult
from test_runs import client


BASE = '/projects/1/runs'
STRATEGY_KEY = 'Research Strategy Axis'
DIMENSION_KEY = 'Research Dimension Axis'


def successful_evaluation(_expected, _generated):
    return {'component_scores': {'syntax': 1, 'execution': 1, 'semantic': 1, 'completeness': 1},
            'overall_accuracy': 100, 'hallucination_detected': False,
            'hallucinated_functions': [], 'errors': [], 'notes': []}


def test_dynamic_metadata_survives_130_case_six_model_run_and_drives_analysis(client, monkeypatch):
    monkeypatch.setattr(batch, 'evaluate_pair', successful_evaluation)
    monkeypatch.setattr(batch, 'validate_ground_truth', lambda _rule: [])
    cases = []
    responses = []
    models = [{'id': f'model_{index}', 'label': f'Research Model {index}'} for index in range(6)]
    for index in range(130):
        reference = f'row_{index + 2}'
        case_id = f'{index + 1:03}'
        dimension = f'Researcher Label {index % 5}'
        metadata = [{'key': STRATEGY_KEY, 'label': STRATEGY_KEY, 'value': 'Arbitrary Strategy', 'source': 'dataset_constant'},
                    {'key': DIMENSION_KEY, 'label': DIMENSION_KEY, 'value': dimension, 'source': 'case_editor'},
                    {'key': 'Unrelated Field', 'label': 'Unrelated Field', 'value': f'Keep {index}'}]
        cases.append({'id': reference, 'case_id': case_id, 'requirement': f'Requirement {index}',
                      'expected_rule': 'expect_column_to_exist("a")', 'metadata': metadata})
        for model in models:
            responses.append({'case_reference': reference, 'model': model['id'],
                              'generated_output': 'expect_column_to_exist("a")', 'metadata': metadata})

    configuration = client.get('/projects/1/protocols/defaults').json()['configuration']
    configuration['analysis_metadata_keys'] = {'strategy': STRATEGY_KEY, 'dimension': DIMENSION_KEY}
    protocol = client.post('/projects/1/protocols', json={'name': 'Metadata protocol', 'configuration': configuration}).json()
    run = client.post(BASE, json={'cases': cases, 'models': models, 'responses': responses,
                                  'protocol_id': protocol['id'], 'protocol_version': protocol['version']})
    assert run.status_code == 201, run.text
    assert run.json()['processed_responses'] == run.json()['total_responses'] == 780

    # Use a fresh session to prove the stored evidence, rather than request objects,
    # is the source used after database reload.
    with db.SessionLocal() as session:
        saved = list(session.scalars(select(EvaluationResult).where(EvaluationResult.run_id == run.json()['id'])))
    assert len(saved) == 780
    assert {item.case_id for item in saved} == {f'{index + 1:03}' for index in range(130)}
    first_metadata = saved[0].snapshot['case']['metadata']
    assert {item['label']: item['value'] for item in first_metadata} == {
        STRATEGY_KEY: 'Arbitrary Strategy', DIMENSION_KEY: 'Researcher Label 0', 'Unrelated Field': 'Keep 0'}
    assert saved[0].snapshot['response']['metadata'] == first_metadata

    analysis = client.get(BASE + '/dashboard/research', params={
        'run_id': run.json()['id'], 'strategy_key': STRATEGY_KEY, 'dimension_key': DIMENSION_KEY}).json()
    assert analysis['metadata_readiness']['matched_strategy_cases'] == 130
    assert analysis['metadata_readiness']['total_strategy_cases'] == 130
    assert analysis['metadata_readiness']['multi_strategy_matched_cases'] == 0
    assert len(analysis['strategies']) == 6
    assert sum(item['response_count'] for item in analysis['strategies']) == 780
    assert {item['value'] for item in analysis['dimensions']} == {f'Researcher Label {index}' for index in range(5)}
    assert sum(item['response_count'] for item in analysis['dimensions']) == 780
