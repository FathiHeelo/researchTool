import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app import db
from app.main import app


@pytest.fixture
def client(tmp_path, monkeypatch):
    engine = create_engine(f"sqlite:///{(tmp_path / 'test.db').as_posix()}", connect_args={"check_same_thread": False})
    monkeypatch.setattr(db, "engine", engine)
    monkeypatch.setattr(db, "SessionLocal", sessionmaker(bind=engine))
    with TestClient(app) as client:
        yield client
    engine.dispose()


def test_create_project(client):
    response = client.post("/projects", json={"name": " Study ", "description": "Research notes"})
    assert response.status_code == 201
    data = response.json()
    assert data["id"] > 0
    assert data["name"] == "Study"
    assert data["description"] == "Research notes"
    assert data["created_at"].endswith("Z")
    assert data["updated_at"].endswith("Z")


def test_list_projects(client):
    assert client.get("/projects").json() == []
    first = client.post("/projects", json={"name": "First"}).json()
    second = client.post("/projects", json={"name": "Second"}).json()
    response = client.get("/projects")
    assert response.status_code == 200
    assert response.json() == [second, first]


def test_get_project(client):
    created = client.post("/projects", json={"name": "Study"}).json()
    response = client.get(f"/projects/{created['id']}")
    assert response.status_code == 200
    assert response.json() == created
    assert response.json()["description"] is None


def test_delete_project(client):
    created = client.post("/projects", json={"name": "Study"}).json()
    response = client.delete(f"/projects/{created['id']}")
    assert response.status_code == 204
    assert response.content == b""
    assert client.get("/projects").json() == []
    assert client.get(f"/projects/{created['id']}").status_code == 404


@pytest.mark.parametrize("method", ["get", "delete"])
def test_missing_project(client, method):
    response = getattr(client, method)("/projects/999")
    assert response.status_code == 404
    assert response.json() == {"detail": "Project not found"}


@pytest.mark.parametrize("name", ["", "   ", "x" * 201])
def test_invalid_name(client, name):
    assert client.post("/projects", json={"name": name}).status_code == 422


@pytest.mark.parametrize("method", ["POST", "DELETE"])
def test_project_cors_preflight(client, method):
    response = client.options("/projects", headers={
        "Origin": "http://localhost:5173",
        "Access-Control-Request-Method": method,
        "Access-Control-Request-Headers": "content-type",
    })
    assert response.status_code == 200
    assert response.headers["access-control-allow-origin"] == "http://localhost:5173"


def test_persists_across_app_restarts(client):
    created = client.post("/projects", json={"name": "Persistent"}).json()
    with TestClient(app) as restarted:
        assert restarted.get(f"/projects/{created['id']}").json() == created
