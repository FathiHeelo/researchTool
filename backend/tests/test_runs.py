import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from app import db
from app.main import app
from app.evaluation import batch


@pytest.fixture
def client(tmp_path, monkeypatch):
    engine = create_engine(f'sqlite:///{(tmp_path / "runs.db").as_posix()}', connect_args={'check_same_thread': False})
    monkeypatch.setattr(db, 'engine', engine)
    monkeypatch.setattr(db, 'SessionLocal', sessionmaker(bind=engine))
    with TestClient(app) as client:
        client.post('/projects', json={'name': 'Research'})
        yield client
    engine.dispose()


def benchmark():
    return {'cases': [{'id': f'row_{i}', 'case_id': f'C{i}', 'requirement': 'Column exists', 'expected_rule': 'expect_column_to_exist("a")', 'original_row_number': i + 2, 'metadata': [{'label': 'arbitrary', 'value': 'context'}]} for i in range(2)],
            'models': [{'id': 'a', 'label': 'Future Model'}, {'id': 'b', 'label': 'Another'}],
            'responses': [{'case_reference': f'row_{i}', 'model': model, 'source_column_name': model, 'generated_output': 'expect_column_to_exist("a")' if model == 'a' else 'expect_invented("a")'} for i in range(2) for model in ['a', 'b']]}


def test_batch_and_filters(client):
    response = client.post('/projects/1/runs', json=benchmark())
    assert response.status_code == 201, response.text
    run = response.json()
    assert run['status'] == 'completed'
    assert run['processed_responses'] == run['total_responses'] == 4
    assert run['summary']['hallucinations'] == 2
    url = f"/projects/1/runs/{run['id']}/results"
    data = client.get(url).json()
    assert data['total'] == 4
    assert data['items'][0]['snapshot']['case']['metadata'][0]['value'] == 'context'
    assert data['items'][0]['scores']['syntax'] == 1
    assert data['items'][0]['notes']
    for query in ['model=Future%20Model', 'min_score=99', 'hallucination=false', 'error_tag=UNKNOWN_FUNCTION', 'max_score=99', 'search=C1']:
        assert client.get(url + '?' + query).json()['total'] == 2
    first = client.get(url + '?page_size=1').json()['items'][0]['id']
    second = client.get(url + '?page_size=1&page=2').json()['items'][0]['id']
    assert first != second
    assert client.get('/projects/1/runs').json()[0]['id'] == run['id']
    assert client.get('/projects/2/runs/1/results').status_code == 404


def test_failure_isolation(client, monkeypatch):
    original = batch.evaluate_pair
    def sometimes(expected, generated):
        if 'invented' in generated: raise RuntimeError('internal secret')
        return original(expected, generated)
    monkeypatch.setattr(batch, 'evaluate_pair', sometimes)
    run = client.post('/projects/1/runs', json=benchmark()).json()
    assert run['status'] == 'completed_with_errors'
    assert run['processed_responses'] == 4
    results = client.get('/projects/1/runs/1/results?error_tag=EVALUATION_ERROR').json()
    assert results['total'] == 2
    assert results['items'][0]['overall_accuracy'] is None
    assert 'internal secret' not in str(results)


def test_invalid_references(client):
    data = benchmark(); data['responses'].pop()
    assert client.post('/projects/1/runs', json=data).status_code == 422


def test_missing_runtime_dependency_persists_failed_run(client, monkeypatch, caplog):
    def unavailable(source):
        raise ModuleNotFoundError("No module named 'great_expectations'")
    monkeypatch.setattr(batch, 'validate_ground_truth', unavailable)
    response = client.post('/projects/1/runs', json=benchmark())
    assert response.status_code == 201
    run = response.json()
    assert run['status'] == 'failed'
    assert run['processed_responses'] == 0
    assert run['completed_at'] is not None
    assert 'installed dependencies' in run['failure_summary']
    assert 'Traceback' not in response.text
    saved = client.get(f"/projects/1/runs/{run['id']}").json()
    assert saved['status'] == 'failed'
    assert len(client.get('/projects/1/runs').json()) == 1
    assert 'great_expectations' in caplog.text
