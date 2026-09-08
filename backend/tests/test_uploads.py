from io import BytesIO

import pytest
from fastapi.testclient import TestClient
from openpyxl import Workbook

from app.main import app

client = TestClient(app)


def test_valid_csv_accepted():
    content = "name,description\nStudy,café\n".encode("utf-8")
    response = client.post("/datasets/upload", files={"file": ("study.csv", content, "text/csv")})
    assert response.status_code == 200
    assert {key: response.json()[key] for key in ("filename", "extension", "size")} == {"filename": "study.csv", "extension": ".csv", "size": len(content)}


def test_valid_xlsx_accepted():
    workbook = Workbook()
    workbook.active.append(["name", "description"])
    stream = BytesIO()
    workbook.save(stream)
    workbook.close()
    content = stream.getvalue()
    response = client.post("/datasets/upload", files={"file": (
        "study.xlsx", content, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    )})
    assert response.status_code == 200
    assert response.json() == {"filename": "study.xlsx", "extension": ".xlsx", "size": len(content),
                               "sheet_names": ["Sheet"], "sheet_count": 1}


@pytest.mark.parametrize("filename", ["study.txt", "study.xls", "study.csv.exe", "study"])
def test_unsupported_extension_rejected(filename):
    response = client.post("/datasets/upload", files={"file": (filename, b"data")})
    assert response.status_code == 400
    assert response.json()["detail"] == "Only .csv and .xlsx files are supported"


def test_missing_upload_rejected():
    assert client.post("/datasets/upload").status_code == 422


@pytest.mark.parametrize("filename", ["empty.csv", "empty.xlsx"])
def test_empty_upload_rejected(filename):
    response = client.post("/datasets/upload", files={"file": (filename, b"")})
    assert response.status_code == 400
    assert response.json()["detail"] == "Uploaded file must not be empty"


def test_missing_filename_rejected():
    response = client.post("/datasets/upload", files={"file": ("", b"data")})
    assert response.status_code == 422


def test_uppercase_extension_accepted():
    response = client.post("/datasets/upload", files={"file": ("Study.CSV", b"name\nStudy\n")})
    assert response.status_code == 200
    assert response.json()["extension"] == ".csv"


def test_upload_counts_multiple_chunks():
    content = b"name\n" + b"Study\n" * 200_000
    response = client.post("/datasets/upload", files={"file": ("large.csv", content)})
    assert response.status_code == 200
    assert response.json()["size"] == len(content)
