import ast
from app.evaluation.parser import parse_rules
from app.evaluation.gx_registry import installed_registry


def validate_ground_truth(source, registry=None):
    registry = registry or installed_registry()
    warnings = []
    def warn(kind, message, severity='warning', details=None):
        warnings.append({'warning_type': kind, 'message': message, 'severity': severity, 'details': details or {}})
    if not isinstance(source, str) or not source.strip():
        warn('EMPTY_EXPECTED_RULE', 'Expected rule is empty or not text', 'critical')
        return warnings
    parsed = parse_rules(source)
    if not parsed.syntax_valid: warn('INVALID_SYNTAX', 'Expected rule contains invalid Python syntax', 'critical')
    if not parsed.calls: warn('MALFORMED_STRUCTURE', 'No expectation calls found', 'critical')
    if parsed.syntax_valid:
        tree = ast.parse(source)
        if len(tree.body) != len(parsed.calls) or not all(isinstance(node, ast.Expr) and isinstance(node.value, ast.Call) for node in tree.body):
            warn('SUSPICIOUS_INVOCATION', 'Reference contains unsupported statements or nested calls')
    for call in parsed.calls:
        for issue in registry.validate(call):
            warn('UNKNOWN_EXPECTATION' if issue['code'] == 'UNKNOWN_FUNCTION' else issue['code'], issue['detail'], details={'function': call.function, 'line': call.line, 'category': issue.get('category')})
    seen = set()
    for call in parsed.calls:
        signature = repr((call.function, call.args, sorted(call.kwargs.items())))
        if signature in seen:
            warn('SUSPICIOUS_CONSTRAINT', 'Reference repeats an identical constraint', 'info')
        seen.add(signature)
    # Column correctness cannot be inferred without an authoritative dataset schema.
    return warnings
