from datetime import date, datetime
from io import BytesIO

import pytest
from fastapi.testclient import TestClient
from openpyxl import Workbook

from app.main import app

client = TestClient(app)


def upload(rows):
    workbook = Workbook()
    workbook.active.title = "Other"
    workbook.active.append(["unrelated"])
    workbook.active.append([False])
    sheet = workbook.create_sheet("Selected")
    for row in rows:
        sheet.append(row)
    stream = BytesIO()
    workbook.save(stream)
    workbook.close()
    response = client.post("/datasets/upload", files={"file": ("data.xlsx", stream.getvalue())}, data={"sheet_name": "Selected"})
    assert response.status_code == 200, response.text
    return response.json()


@pytest.mark.parametrize("values,expected", [
    (["hello", "world"], "text"),
    (["yes", "no", "true", "123"], "text"),
    ([1, 2.0, -3, 0], "integer"),
    ([1.5, -2.25], "decimal"),
    ([True, False], "boolean"),
    ([date(2026, 9, 7), datetime(2026, 9, 8)], "date"),
    ([datetime(2026, 9, 7, 12, 30)], "datetime"),
    ([None, 1, None, 2], "integer"),
    ([None, "", "   "], "unknown"),
    ([1, "text", 2], "unknown"),
    ([True, 1], "unknown"),
    ([1, 2.5], "decimal"),
    ([2.5, 1], "decimal"),
    ([date(2026, 9, 7), datetime(2026, 9, 8, 1)], "datetime"),
    ([datetime(2026, 9, 8, 1), "2026-09-08"], "unknown"),
])
def test_value_types(values, expected):
    data = upload([["value"]] + [[value] for value in values])
    assert data["inferred_data_types"] == [expected]


def test_duplicate_and_blank_headers_align():
    data = upload([["same", "same", None, ""], [1, "text", True, 2.5]])
    assert data["columns"] == ["same", "same", None, None]
    assert data["inferred_data_types"] == ["integer", "text", "boolean", "decimal"]


def test_header_only():
    assert upload([["a", "b"]])["inferred_data_types"] == ["unknown", "unknown"]


def test_empty_selected_sheet():
    assert upload([])["inferred_data_types"] == []


def test_null_heavy_columns_and_wider_rows():
    data = upload([["a", "b", "empty"], [None, True], [2, None, None, "word"]])
    assert data["inferred_data_types"] == ["integer", "boolean", "unknown", "text"]


def test_inference_inspects_all_rows():
    data = upload([["a"]] + [[1]] * 12 + [["incompatible"]])
    assert data["inferred_data_types"] == ["unknown"]
