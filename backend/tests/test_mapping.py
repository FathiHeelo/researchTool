import json
import pytest
from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)

def send(assignments, content=b'id,req,expected,Future model,extra\nR1,Do it,Rule,Output,context\n'):
    return client.post('/datasets/import', files={'file': ('data.csv', content)}, data={'mapping': json.dumps({'assignments': assignments})})

def mapping():
    return [{'index': 1, 'role': 'requirement'}, {'index': 2, 'role': 'expected_rule'}, {'index': 3, 'role': 'model'}]

def test_normalization_preserves_metadata_and_source():
    result = send(mapping() + [{'index': 0, 'role': 'case_id'}])
    assert result.status_code == 200
    data = result.json()
    assert data['cases'][0]['case_id'] == 'R1'
    assert data['cases'][0]['requirement'] == 'Do it'
    assert data['cases'][0]['expected_rule'] == 'Rule'
    assert data['cases'][0]['metadata'][0]['value'] == 'context'
    assert data['responses'][0]['source_column_name'] == 'Future model'
    assert data['responses'][0]['original_row_number'] == 2
    assert data['responses'][0]['generated_output'] == 'Output'

@pytest.mark.parametrize('count', [1, 2, 6, 20])
def test_any_number_of_models(count):
    content = (','.join(['req', 'expected'] + [f'Unknown {i}' for i in range(count)]) + '\na,b,' + ','.join(['output'] * count) + '\n').encode()
    assignments = [{'index': 0, 'role': 'requirement'}, {'index': 1, 'role': 'expected_rule'}] + [{'index': i + 2, 'role': 'model'} for i in range(count)]
    data = send(assignments, content).json()
    assert len(data['models']) == len(data['responses']) == count
    assert data['cases'][0]['case_id'] == 'row_2'

@pytest.mark.parametrize('assignments', [[], mapping()[:-1], mapping()[1:], mapping() + [{'index': 1, 'role': 'model'}], mapping() + [{'index': 99, 'role': 'ignored'}]])
def test_invalid_mapping(assignments):
    assert send(assignments).status_code == 400

def test_metadata_label_and_custom_model():
    assignments = mapping()
    assignments[-1]['label'] = 'Researcher model'
    data = send(assignments + [{'index': 4, 'role': 'metadata', 'label': 'Custom dimension'}]).json()
    assert data['models'][0]['label'] == 'Researcher model'
    assert data['cases'][0]['metadata'][1]['label'] == 'Custom dimension'

def test_csv_original_physical_rows():
    data = send(mapping(), b'\n\nid,req,expected,model,extra\nR1,"multi\nline",rule,out,meta\nR2,next,rule,out,meta\n').json()
    assert [case['original_row_number'] for case in data['cases']] == [4, 6]

def test_xlsx_duplicate_headers_and_selected_sheet():
    from io import BytesIO
    from openpyxl import Workbook
    workbook = Workbook()
    workbook.active.append(['Other'])
    sheet = workbook.create_sheet('Selected')
    sheet.append(['req', 'expected', 'model', 'model', None])
    sheet.append(['requirement', 'rule', 'first', 'second', 'extra'])
    stream = BytesIO()
    workbook.save(stream)
    workbook.close()
    assignments = [{'index': 0, 'role': 'requirement'}, {'index': 1, 'role': 'expected_rule'}, {'index': 2, 'role': 'model'}, {'index': 3, 'role': 'model'}]
    response = client.post('/datasets/import', files={'file': ('data.xlsx', stream.getvalue())}, data={'sheet_name': 'Selected', 'mapping': json.dumps({'assignments': assignments})})
    assert response.status_code == 200
    data = response.json()
    assert [item['generated_output'] for item in data['responses']] == ['first', 'second']
    assert data['models'][0]['id'] != data['models'][1]['id']
    assert data['cases'][0]['metadata'][0]['value'] == 'extra'
