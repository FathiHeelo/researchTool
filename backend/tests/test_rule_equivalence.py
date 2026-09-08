import pytest
from app.evaluation.equivalence import compare_rules
from app.evaluation.canonicalizer import default_registry


@pytest.mark.parametrize('left,right', [
    ('expect_column_to_exist("a")', "expect_column_to_exist('a')"),
    (r'expect_custom(regex=r"\d+")', r'''expect_custom(regex='\\d+')'''),
    ('expect_column_to_exist("a")', 'expect_column_to_exist(column="a")'),
    ('expect_column_values_to_be_of_type("a", "text")', 'expect_column_values_to_be_of_type("a", "str")'),
    ('expect_column_values_to_be_of_type("a", "int")', 'expect_column_values_to_be_of_type("a", "integer")'),
    ('expect_column_values_to_be_between("a", max_value=None)', 'expect_column_values_to_be_between("a")'),
    ('expect_column_values_to_be_between("a", min_value=None)', 'expect_column_values_to_be_between("a")'),
    ('expect_column_value_lengths_to_be_between("a", min_value=0)', 'expect_column_value_lengths_to_be_between("a")'),
    ('expect_column_values_to_be_between("a", min_value=0)', 'expect_column_values_to_be_between("a", min_value=0.0)'),
    ('expect_column_values_to_be_greater_than("a", value=0)', 'expect_column_values_to_be_between("a", min_value=0, strict_min=True)'),
    ('expect_column_to_exist("a")\nexpect_column_to_exist("b")', 'expect_column_to_exist("b")\nexpect_column_to_exist("a")'),
])
def test_equivalent(left, right):
    assert compare_rules(left, right).semantic_equivalent
    assert compare_rules(right, left).semantic_equivalent


@pytest.mark.parametrize('left,right', [
    ('expect_column_values_to_be_between("a", min_value=0)', 'expect_column_values_to_be_between("a", min_value=0, strict_min=True)'),
    ('expect_column_values_to_be_of_type("a", "decimal")', 'expect_column_values_to_be_of_type("a", "float")'),
    ('expect_column_values_to_be_between("a", min_value=1)', 'expect_column_values_to_be_between("a", min_value=2)'),
    ('expect_column_values_to_be_between("a", max_value=1)', 'expect_column_values_to_be_between("a", max_value=2)'),
    ('expect_column_to_exist("a")', 'expect_column_to_exist("b")'),
    ('expect_column_to_exist("a")', 'expect_column_to_exist("a")\nexpect_column_to_exist("b")'),
    ('expect_column_values_to_be_between("a")', 'expect_column_values_to_be_between("a", max_value=2)'),
    ('expect_column_value_lengths_to_be_between("a", min_value=1)', 'expect_column_value_lengths_to_be_between("a")'),
    ('expect_custom(type_="text")', 'expect_custom(type_="str")'),
    ('expect_custom(min_value=None)', 'expect_custom()'),
    ('expect_custom("a")', 'expect_custom(column="a")'),
    ('expect_custom(value=0)', 'expect_custom(value=0.0)'),
    ('expect_column_values_to_be_greater_than("a", value=0)', 'expect_column_values_to_be_between("a", min_value=0)'),
    ('expect_column_values_to_be_between("a", min_value=True)', 'expect_column_values_to_be_between("a", min_value=1)'),
    (r'expect_custom(regex=r"\d+")', r'expect_custom(regex=r"\w+")'),
])
def test_not_equivalent(left, right):
    assert not compare_rules(left, right).semantic_equivalent


def test_layers_are_separate():
    result = compare_rules('expect_column_values_to_be_of_type("a", "text")', 'expect_column_values_to_be_of_type("a", "str")')
    assert result.semantic_equivalent
    assert not result.structural_equivalent
    assert not result.syntactic_equivalent
    assert result.execution_valid is None


def test_unhandled_statements_not_ignored():
    assert not compare_rules('x=1', 'x=2').semantic_equivalent


def test_recovery_never_claims_strict_equivalence():
    result = compare_rules('!!!\nexpect_column_to_exist("a")', 'expect_column_to_exist("a")')
    assert not result.semantic_equivalent
    assert result.recovered_calls_equivalent


def test_registry_extension():
    registry = default_registry()
    registry.signatures['expect_future'] = ('column',)
    assert compare_rules('expect_future("a")', 'expect_future(column="a")', registry).structural_equivalent
