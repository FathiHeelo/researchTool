import json

import pytest
from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def upload(content):
    response = client.post("/datasets/upload", files={"file": ("data.csv", content.encode("utf-8"))})
    assert response.status_code == 200, response.text
    return response.json()


def test_counts_and_exact_columns():
    data = upload('\ufeff Case ID ,Résumé,empty\n001,café,\n002,study,\n')
    assert data["total_row_count"] == 2
    assert data["column_count"] == 3
    assert data["columns"] == [" Case ID ", "Résumé", "empty"]
    assert data["preview_rows"][0] == {" Case ID ": "001", "Résumé": "café", "empty": None}


@pytest.mark.parametrize("count", [0, 1, 9, 10, 15])
def test_preview_limit(count):
    data = upload("value\n" + "".join(f"{i}\n" for i in range(count)))
    assert data["total_row_count"] == count
    assert data["preview_rows"] == [{"value": str(i)} for i in range(min(count, 10))]
    if count == 0:
        assert data["inferred_data_types"] == {"value": "unknown"}


def test_quoted_values():
    data = upload('"Name, exact",note\n"Doe, Jane","line one\nline ""two"""\n')
    assert data["total_row_count"] == 1
    assert data["preview_rows"] == [{"Name, exact": "Doe, Jane", "note": 'line one\nline "two"'}]


def test_nulls_are_json_safe_and_literals_preserved():
    data = upload("a,b,c,d\n,NaN,null,Infinity\n,,,\n")
    assert data["total_row_count"] == 2
    assert data["preview_rows"] == [
        {"a": None, "b": "NaN", "c": "null", "d": "Infinity"},
        {"a": None, "b": None, "c": None, "d": None},
    ]
    json.dumps(data, allow_nan=False)


def test_normalized_types():
    data = upload("i,d,b,date,dt,text,missing\n1,1.5,true,2026-09-07,2026-09-07T12:00:00Z,hello,\n2,3,FALSE,2026-09-08,2026-09-08 13:00:00,world,\n")
    assert data["inferred_data_types"] == {
        "i": "integer", "d": "decimal", "b": "boolean", "date": "date",
        "dt": "datetime", "text": "text", "missing": "unknown",
    }


def test_inference_uses_rows_beyond_preview():
    data = upload("value\n" + "1\n" * 10 + "word\n")
    assert data["inferred_data_types"] == {"value": "text"}
    assert len(data["preview_rows"]) == 10


def test_blank_lines_and_missing_cells():
    data = upload("a,b\n\n1,\n,2\n\n")
    assert data["total_row_count"] == 2
    assert data["inferred_data_types"] == {"a": "integer", "b": "integer"}


def test_duplicate_columns_rejected_without_silent_loss():
    response = client.post("/datasets/upload", files={"file": ("data.csv", b"a,a\n1,2\n")})
    assert response.status_code == 400
    assert response.json()["code"] == "malformed_csv"


def test_blank_column_name_preserved():
    data = upload("a,\n1,2\n")
    assert data["columns"] == ["a", ""]
    assert data["preview_rows"] == [{"a": "1", "": "2"}]


def test_invalid_date_and_mixed_types_are_text():
    data = upload("date,mixed\n2026-02-30,1\n2026-09-07,false\n")
    assert data["inferred_data_types"] == {"date": "text", "mixed": "text"}
