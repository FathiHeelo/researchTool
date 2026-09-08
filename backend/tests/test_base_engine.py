import pytest
from app.evaluation.engine import evaluate_pair, overall_accuracy
from app.evaluation.gx_registry import ExpectationRegistry

A = 'expect_column_to_exist("a")'
B = 'expect_column_values_to_not_be_null("a")'

def test_exact_and_reordered():
    result = evaluate_pair(A + '\n' + B, B + '\n' + A)
    assert result['overall_accuracy'] == 100
    assert not result['hallucination_detected']

def test_recovered_syntax_remains_invalid():
    result = evaluate_pair(A, '!!!\n' + A)
    assert result['syntax'] == result['execution'] == 0

@pytest.mark.parametrize('source,code', [
    ('expect_invented("a")', 'UNKNOWN_FUNCTION'),
    ('expect_column_to_exist(column="a", nonsense=1)', 'INVALID_PARAMETER'),
    ('expect_column_to_exist()', 'MISSING_REQUIRED_PARAMETER'),
    ('expect_column_to_exist("a", column="a")', 'INVALID_INVOCATION'),
])
def test_execution_failures(source, code):
    result = evaluate_pair(A, source)
    assert result['execution'] == 0
    assert code in {error['code'] for error in result['errors']}

def test_multiple_calls_one_failure():
    result = evaluate_pair(A, A + '\nexpect_invented()')
    assert result['execution'] == 0
    assert result['hallucinated_functions'] == ['expect_invented']

def test_environment_dependent_not_invented():
    registry = ExpectationRegistry(environment_dependent=['expect_custom'])
    result = evaluate_pair(A, 'expect_custom()', registry)
    assert result['execution'] == 0
    assert result['environment_dependent_functions'] == ['expect_custom']
    assert result['hallucinated_functions'] == []

def test_missing_condition():
    result = evaluate_pair(A + '\n' + B, A)
    assert result['semantic'] == result['completeness'] == 0.5

def test_extra_condition_preserves_completeness():
    result = evaluate_pair(A, A + '\n' + B)
    assert result['semantic'] == 0.5
    assert result['completeness'] == 1
    assert result['overall_accuracy'] == 87.5

def test_wrong_boundary():
    result = evaluate_pair('expect_column_values_to_be_between("a", min_value=0)', 'expect_column_values_to_be_between("a", min_value=0, strict_min=True)')
    assert result['semantic'] == 0.5
    assert result['overall_accuracy'] == 87.5

def test_equivalent_formulation():
    result = evaluate_pair('expect_column_values_to_be_greater_than("a", value=0)', 'expect_column_values_to_be_between("a", min_value=0, strict_min=True)')
    assert result['semantic'] == result['completeness'] == 1

def test_wrong_meaning():
    assert evaluate_pair(A, B)['semantic'] == 0

def test_dynamic_scores():
    assert overall_accuracy({'a': 1, 'b': 1, 'c': 0.5, 'd': 1}) == 87.5
    assert 'custom' in evaluate_pair(A, A, extra_evaluators={'custom': lambda a, b: 1})['component_scores']

def test_regex_integration():
    result = evaluate_pair('expect_column_values_to_match_regex("a", regex="^(https?|ftp)://.*$")', 'expect_column_values_to_match_regex("a", regex="^https?://.*$")')
    assert result['semantic'] == 0.5
    assert 'REGEX_STRICTER' in {error['code'] for error in result['errors']}
