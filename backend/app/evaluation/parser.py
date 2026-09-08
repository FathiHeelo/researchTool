import ast
from dataclasses import dataclass, field
from typing import Any


@dataclass(frozen=True)
class Expression:
    """Unevaluated expression, preserved structurally for later extensions."""
    ast_dump: str


@dataclass
class ParsedCall:
    function: str
    args: list[Any]
    kwargs: dict[str, Any]
    original_text: str
    order: int
    line: int
    recovered: bool = False


@dataclass
class ParseResult:
    syntax_valid: bool
    syntax_error: dict | None
    calls: list[ParsedCall] = field(default_factory=list)
    original_text: str = ''


def value(node):
    if isinstance(node, ast.Constant):
        return node.value
    if isinstance(node, ast.UnaryOp) and isinstance(node.op, (ast.USub, ast.UAdd)):
        operand = value(node.operand)
        if type(operand) in (int, float):
            return -operand if isinstance(node.op, ast.USub) else operand
    if isinstance(node, (ast.List, ast.Tuple, ast.Set)):
        items = [value(item) for item in node.elts]
        if isinstance(node, ast.List): return items
        if isinstance(node, ast.Tuple): return tuple(items)
        # Sets and dictionaries remain AST expressions when not simple literals.
    if isinstance(node, ast.Dict) and all(isinstance(key, ast.Constant) and isinstance(key.value, str) for key in node.keys):
        return {key.value: value(item) for key, item in zip(node.keys, node.values)}
    return Expression(ast.dump(node, include_attributes=False))


def function_name(node):
    if isinstance(node, ast.Name): return node.id
    if isinstance(node, ast.Attribute):
        prefix = function_name(node.value)
        return f'{prefix}.{node.attr}' if prefix else None
    return None


def extract(tree, source, line_offset=0, recovered=False):
    calls = []
    for node in sorted((node for node in ast.walk(tree) if isinstance(node, ast.Call)), key=lambda n: (n.lineno, n.col_offset)):
        name = function_name(node.func)
        if not name or not name.split('.')[-1].startswith('expect_'):
            continue
        kwargs = {}
        for index, keyword in enumerate(node.keywords):
            kwargs[keyword.arg if keyword.arg is not None else f'**{index}'] = value(keyword.value)
        calls.append(ParsedCall(name, [value(arg) for arg in node.args], kwargs,
                                ast.get_source_segment(source, node) or '', len(calls),
                                node.lineno + line_offset, recovered))
    return calls


def parse_rules(source: str) -> ParseResult:
    """Strictly compile to an AST only; recover standalone one-line calls.

    Recovery deliberately does not repair quotes, punctuation, or expressions.
    Only independently valid lines beginning with an expectation call qualify.
    Recovered calls never make the original text syntactically valid.
    """
    try:
        tree = compile(source, '<rules>', 'exec', flags=ast.PyCF_ONLY_AST)
        # AST compilation also catches duplicate keyword and other compile-time
        # syntax errors by compiling the tree to code without executing it.
        compile(tree, '<rules>', 'exec')
        return ParseResult(True, None, extract(tree, source), source)
    except (SyntaxError, ValueError) as error:
        detail = {'message': str(error), 'line': getattr(error, 'lineno', None), 'offset': getattr(error, 'offset', None)}
        result = ParseResult(False, detail, original_text=source)
        for index, line in enumerate(source.splitlines()):
            candidate = line.strip()
            try:
                tree = ast.parse(candidate)
                compile(tree, '<recovered>', 'exec')
            except (SyntaxError, ValueError):
                continue
            if len(tree.body) != 1 or not isinstance(tree.body[0], ast.Expr) or not isinstance(tree.body[0].value, ast.Call):
                continue
            found = extract(tree, candidate, index, True)
            for call in found:
                call.order = len(result.calls)
                result.calls.append(call)
        return result
