from app.evaluation.parser import Expression, parse_rules


def test_calls_and_literals():
    source = '\nexpect_column_to_exist("id")\n\nexpect_column_values_to_be_between(column="x", min_value=-1, max_value=2.5)\n'
    result = parse_rules(source)
    assert result.syntax_valid
    assert [call.order for call in result.calls] == [0, 1]
    assert result.calls[0].args == ['id']
    assert result.calls[1].kwargs == {'column': 'x', 'min_value': -1, 'max_value': 2.5}
    assert result.calls[0].original_text == 'expect_column_to_exist("id")'
    assert result.original_text == source


def test_raw_and_escaped_strings():
    a = parse_rules(r'expect_custom(regex=r"\d+")')
    b = parse_rules(r'''expect_custom(regex='\\d+')''')
    assert a.calls[0].kwargs == b.calls[0].kwargs


def test_recovery_is_not_syntax_success():
    result = parse_rules('broken !!!\nexpect_column_to_exist("id")\nexpect_bad(')
    assert not result.syntax_valid
    assert result.syntax_error['line'] == 1
    assert len(result.calls) == 1
    assert result.calls[0].recovered
    assert result.calls[0].line == 2


def test_never_executes(tmp_path):
    target = tmp_path / 'must_not_exist'
    result = parse_rules(f'expect_custom(value=open({str(target)!r}, "w").write("bad"))')
    assert result.syntax_valid
    assert isinstance(result.calls[0].kwargs['value'], Expression)
    assert not target.exists()


def test_duplicate_keywords_are_invalid():
    assert not parse_rules('expect_custom(a=1, a=2)').syntax_valid


def test_unknown_functions_can_parse():
    assert parse_rules('expect_invented(column="a")').syntax_valid


def test_multiline_and_qualified_calls():
    result = parse_rules('validator.expect_custom(\ncolumn="a",\nvalues=[1, None, True]\n)')
    assert result.calls[0].function == 'validator.expect_custom'
    assert result.calls[0].kwargs['values'] == [1, None, True]
