import json
from datetime import date, datetime
from io import BytesIO

import pytest
from fastapi.testclient import TestClient
from openpyxl import Workbook

from app.main import app
from app.services.dataset_service import serialize_xlsx_value

client = TestClient(app)


def upload(rows):
    workbook = Workbook()
    workbook.active.title = "Other"
    workbook.active.append(["Not selected"])
    workbook.active.append(["Do not preview"])
    selected = workbook.create_sheet("Selected")
    for row in rows:
        selected.append(row)
    stream = BytesIO()
    workbook.save(stream)
    workbook.close()
    response = client.post("/datasets/upload", files={"file": ("data.xlsx", stream.getvalue())}, data={"sheet_name": "Selected"})
    assert response.status_code == 200, response.text
    data = response.json()
    json.dumps(data, allow_nan=False)
    return data


@pytest.mark.parametrize("count", [0, 1, 7, 10, 15])
def test_preview_limit_and_order(count):
    data = upload([["id", "amount"]] + [[i, i + 0.5] for i in range(count)])
    assert data["preview_rows"] == [
        {"row_index": i + 1, "values": [i, i + 0.5]} for i in range(min(count, 10))
    ]
    assert data["total_row_count"] == count


def test_json_safe_cells():
    data = upload([["null", "integer", "decimal", "boolean", "text", "date", "datetime"],
                   [None, 42, 10.5, True, "بيانات café", date(2026, 9, 7), datetime(2026, 9, 7, 13, 14, 15)]])
    assert data["preview_rows"] == [{"row_index": 1, "values": [
        None, 42, 10.5, True, "بيانات café", "2026-09-07T00:00:00", "2026-09-07T13:14:15",
    ]}]


def test_duplicate_and_blank_headers():
    data = upload([["same", "same", None], ["A", "B", "C", "D"]])
    assert data["columns"] == ["same", "same", None, None]
    assert data["preview_rows"] == [{"row_index": 1, "values": ["A", "B", "C", "D"]}]


def test_later_wider_rows_pad_earlier_preview():
    data = upload([["a"], [1]] + [[2]] * 10 + [[3, 4]])
    assert data["columns"] == ["a", None]
    assert all(len(row["values"]) == 2 for row in data["preview_rows"])
    assert data["preview_rows"][0]["values"] == [1, None]


def test_blank_rows_skipped_consistently_with_row_count():
    data = upload([["a", "b"], [1], [None, None], [0, False]])
    assert data["total_row_count"] == 2
    assert data["preview_rows"] == [
        {"row_index": 1, "values": [1, None]}, {"row_index": 3, "values": [0, False]},
    ]


def test_empty_selected_sheet():
    assert upload([])["preview_rows"] == []


@pytest.mark.parametrize("value", [float("nan"), float("inf"), float("-inf")])
def test_nonfinite_serializer(value):
    # Excel writers may discard nonfinite numbers; exercise serialization directly.
    assert serialize_xlsx_value(value) is None


def test_literal_nan_text_is_preserved():
    assert upload([["a"], ["NaN"]])["preview_rows"][0]["values"] == ["NaN"]
