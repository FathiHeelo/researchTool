import ast
from collections import Counter
from dataclasses import dataclass

from app.evaluation.canonicalizer import canonicalize
from app.evaluation.parser import parse_rules


@dataclass
class EquivalenceResult:
    syntactic_equivalent: bool
    structural_equivalent: bool
    semantic_equivalent: bool
    execution_valid: None = None
    recovered_calls_equivalent: bool | None = None


def compare_rules(left: str, right: str, registry=None):
    a, b = parse_rules(left), parse_rules(right)
    strict = a.syntax_valid and b.syntax_valid
    structural = Counter(canonicalize(call, registry, False) for call in a.calls) == Counter(canonicalize(call, registry, False) for call in b.calls)
    semantic = Counter(canonicalize(call, registry) for call in a.calls) == Counter(canonicalize(call, registry) for call in b.calls)
    # Only expression statements consisting of expectation calls are fully
    # covered. Assignments/control flow must not be silently ignored.
    def covered(source, result):
        if not result.syntax_valid: return False
        tree = ast.parse(source)
        return len(tree.body) == len(result.calls) and all(isinstance(node, ast.Expr) and isinstance(node.value, ast.Call) for node in tree.body)
    complete = covered(left, a) and covered(right, b)
    syntax = strict and ast.dump(ast.parse(left), include_attributes=False) == ast.dump(ast.parse(right), include_attributes=False)
    return EquivalenceResult(syntax, complete and structural, complete and semantic,
                             recovered_calls_equivalent=semantic if not strict and a.calls and b.calls else None)
