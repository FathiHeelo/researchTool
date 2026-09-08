import pytest
from app.evaluation.regex_comparator import compare_regex
from app.evaluation.parser import parse_rules

@pytest.mark.parametrize('a,b,classification', [
    (r'^[A-Z]{3}$', r'^[A-Z]{3}$', 'equivalent'),
    (r'a\/b', 'a/b', 'equivalent'),
    (r'\.', '.', 'broader'),
    ('.', r'\.', 'stricter'),
    ('^abc$', 'abc', 'broader'),
    ('abc', '^abc$', 'stricter'),
    ('^(https?|ftp)://.*$', '^https?://.*$', 'stricter'),
    ('^http://.*$', '^(https?|ftp)://.*$', 'broader'),
    (r'^\d{5}(-\d{4})?$', r'^\d{5}$', 'stricter'),
    ('^abc$', '^xyz$', 'different'),
    (r'\d', r'\\d', 'unknown'),
    (r'\\/', r'\/', 'unknown'),
    ('[', 'a', 'unknown'),
])
def test_regex_relations(a, b, classification):
    assert compare_regex(a, b).classification == classification

def test_python_escaping_already_decoded():
    a = parse_rules(r'expect_custom(regex=r"\d{5}")').calls[0].kwargs['regex']
    b = parse_rules(r'expect_custom(regex="\\d{5}")').calls[0].kwargs['regex']
    assert compare_regex(a, b).classification == 'equivalent'
