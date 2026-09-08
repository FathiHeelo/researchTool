"""Single-pair static evaluation with extensible component scoring."""
import ast
from dataclasses import replace

from app.evaluation.parser import parse_rules
from app.evaluation.canonicalizer import canonicalize, default_registry
from app.evaluation.gx_registry import installed_registry
from app.evaluation.regex_comparator import compare_regex


def overall_accuracy(scores):
    return sum(scores.values()) / len(scores) * 100 if scores else 0.0


def evaluate_pair(expected, generated, registry=None, extra_evaluators=None):
    registry = registry or installed_registry()
    a, b = parse_rules(expected), parse_rules(generated)
    rules = default_registry()
    for name, impl in registry.implementations.items():
        rules.signatures.setdefault(name, tuple(impl.args_keys))
    # Receiver names are source variables, not expectation identity here.
    def key(call):
        return canonicalize(replace(call, function=call.function.split('.')[-1]), rules)
    wanted, actual = [key(call) for call in a.calls], [key(call) for call in b.calls]
    errors, notes = [], []
    def tag(code, detail): errors.append({'code': code, 'detail': detail})
    if not b.syntax_valid: tag('SYNTAX_ERROR', b.syntax_error['message'])
    if not a.syntax_valid: tag('EXPECTED_SYNTAX_ERROR', 'Expected source has invalid syntax; comparison uses recovered calls')
    failures = [failure for call in b.calls for failure in registry.validate(call)]
    errors.extend(failures)
    unknown = sorted({failure['function'] for failure in failures if failure['category'] == 'unknown'})
    unsupported = sorted({failure['function'] for failure in failures if failure['category'] == 'environment-dependent'})
    covered = False
    if b.syntax_valid:
        tree = ast.parse(generated)
        covered = len(tree.body) == len(b.calls) and all(isinstance(node, ast.Expr) and isinstance(node.value, ast.Call) for node in tree.body)
    if not covered: tag('INVALID_INVOCATION', 'Output includes syntax errors or unsupported statements')
    remaining = list(actual)
    exact = 0
    unmatched = []
    for condition in wanted:
        if condition in remaining:
            remaining.remove(condition); exact += 1
        else: unmatched.append(condition)
    partial = 0
    for condition in unmatched:
        params = dict(condition[2])
        match = next((candidate for candidate in remaining if candidate[0] == condition[0] and dict(candidate[2]).get('column') == params.get('column')), None)
        if match is None:
            tag('MISSING_CONDITION', 'Expected condition is absent')
            continue
        remaining.remove(match)
        other = dict(match[2])
        if 'regex' in params and 'regex' in other:
            result = compare_regex(params['regex'][1], other['regex'][1])
            notes.append(result.reason)
            if result.classification == 'equivalent' and {k: v for k, v in params.items() if k != 'regex'} == {k: v for k, v in other.items() if k != 'regex'}:
                exact += 1; continue
            tag('REGEX_' + result.classification.upper(), result.reason)
            if result.classification in ('broader', 'stricter'): partial += 1
        else:
            partial += 1
            differing = {k for k in params.keys() | other.keys() if params.get(k) != other.get(k)}
            tag('WRONG_TYPE' if 'type_' in differing else 'WRONG_BOUNDARY' if differing & {'min_value', 'max_value', 'strict_min', 'strict_max'} else 'INVALID_PARAMETER', 'Matching expectation family has different constraints')
    if remaining: tag('EXTRA_CONSTRAINT', 'Generated output contains additional conditions')
    represented = exact + partial
    completeness = 1 if wanted and represented == len(wanted) else 0.5 if represented else 0
    semantic = 1 if wanted and exact == len(wanted) and not remaining else 0.5 if exact or partial else 0
    if not covered and b.syntax_valid: semantic = 0
    scores = {'syntax': int(b.syntax_valid), 'execution': int(bool(b.calls) and covered and not failures), 'semantic': semantic, 'completeness': completeness}
    for name, evaluator in (extra_evaluators or {}).items(): scores[name] = evaluator(a, b)
    notes.append('Execution checks installed GX configuration only; no dataset validation was run.')
    return {**scores, 'component_scores': scores, 'overall_accuracy': overall_accuracy(scores), 'errors': errors, 'notes': notes,
            'hallucination_detected': bool(unknown), 'hallucinated_functions': unknown,
            'environment_dependent_functions': unsupported, 'gx_version': registry.version}
