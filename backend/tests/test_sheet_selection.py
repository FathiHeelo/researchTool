from io import BytesIO

import pytest
from fastapi.testclient import TestClient
from openpyxl import Workbook

from app.main import app

client = TestClient(app)
NAMES = ["Orders", " Research Data ", "بيانات", "Hidden", "Empty"]


@pytest.fixture
def workbook_content():
    workbook = Workbook()
    workbook.active.title = NAMES[0]
    workbook.active.append(["header"])
    for name in NAMES[1:]:
        workbook.create_sheet(name)
    workbook["Hidden"].sheet_state = "hidden"
    stream = BytesIO()
    workbook.save(stream)
    workbook.close()
    return stream.getvalue()


def test_without_selection_preserves_response(workbook_content):
    response = client.post("/datasets/upload", files={"file": ("data.xlsx", workbook_content)})
    assert response.status_code == 200
    assert response.json() == {
        "filename": "data.xlsx", "extension": ".xlsx", "size": len(workbook_content),
        "sheet_names": NAMES, "sheet_count": len(NAMES),
    }


@pytest.mark.parametrize("name", NAMES)
def test_exact_selection_including_hidden_and_empty(workbook_content, name):
    response = client.post("/datasets/upload", files={"file": ("data.xlsx", workbook_content)}, data={"sheet_name": name})
    assert response.status_code == 200
    assert response.json() == {
        "filename": "data.xlsx", "extension": ".xlsx", "size": len(workbook_content),
        "sheet_names": NAMES, "sheet_count": len(NAMES), "selected_sheet": name,
        "total_row_count": 0, "column_count": 1 if name == "Orders" else 0,
        "columns": ["header"] if name == "Orders" else [],
        "inferred_data_types": ["unknown"] if name == "Orders" else [],
        "preview_rows": [],
    }


@pytest.mark.parametrize("name", ["Missing", "orders", "ORDERS", "Research Data", "Orders ", " "])
def test_missing_or_inexact_selection(workbook_content, name):
    response = client.post("/datasets/upload", files={"file": ("data.xlsx", workbook_content)}, data={"sheet_name": name})
    assert response.status_code == 400
    assert response.json()["code"] == "sheet_not_found"
    assert "match exactly" in response.json()["detail"]


def test_csv_selection_rejected_explicitly():
    response = client.post("/datasets/upload", files={"file": ("data.csv", b"a\n1\n")}, data={"sheet_name": "Orders"})
    assert response.status_code == 400
    assert response.json() == {"code": "sheet_selection_not_supported", "detail": "Sheet selection is only supported for XLSX files"}


def test_malformed_workbook_with_selection_still_rejected():
    response = client.post("/datasets/upload", files={"file": ("data.xlsx", b"not a workbook")}, data={"sheet_name": "Orders"})
    assert response.status_code == 400
    assert response.json()["code"] == "malformed_xlsx"
