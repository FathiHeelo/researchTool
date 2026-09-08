"""Conservative deterministic regex relations; never runs regexes on user data."""
import re
from dataclasses import dataclass


@dataclass(frozen=True)
class RegexComparison:
    classification: str
    reason: str


def compare_regex(expected, generated):
    if not isinstance(expected, str) or not isinstance(generated, str):
        return RegexComparison('unknown', 'Regex is not a literal string')
    try:
        re.compile(expected)
        re.compile(generated)
    except re.error:
        return RegexComparison('unknown', 'Invalid regex syntax')
    # Slash has no special meaning in Python regex. Do not collapse backslashes:
    # Python escaping was already decoded by the AST parser.
    def normalize_slashes(pattern):
        output = []
        index = 0
        while index < len(pattern):
            if pattern[index] == '\\' and index + 1 < len(pattern):
                following = pattern[index + 1]
                output.append('/' if following == '/' else pattern[index:index + 2])
                index += 2
            else:
                output.append(pattern[index]); index += 1
        return ''.join(output)
    a, b = normalize_slashes(expected), normalize_slashes(generated)
    if a == b: return RegexComparison('equivalent', 'Identical decoded regex')
    if {a, b} == {'.', r'\.'}:
        return RegexComparison('broader' if b == '.' else 'stricter', 'Wildcard versus literal dot')
    # Only peel unambiguous leading/trailing anchors; escaped dollars are literal.
    def anchors(pattern):
        start = pattern.startswith('^')
        end = pattern.endswith('$') and not pattern.endswith(r'\$')
        return pattern[int(start):len(pattern) - int(end)], {key for key, enabled in [('start', start), ('end', end)] if enabled}
    ac, aa = anchors(a); bc, ba = anchors(b)
    # A small finite literal grammar permits exact set inclusion proofs.
    # Anything with regex operators beyond grouping/alternation stays unknown.
    def alternatives(core):
        if core.startswith('(?:') and core.endswith(')'): core = core[3:-1]
        elif core.startswith('(') and core.endswith(')'): core = core[1:-1]
        parts = core.split('|')
        return set(parts) if all(re.fullmatch(r'[A-Za-z0-9]+', part) for part in parts) else None
    left, right = alternatives(ac), alternatives(bc)
    if aa == ba and left is not None and right is not None:
        if left == right: return RegexComparison('equivalent', 'Same finite literal alternatives')
        if right < left: return RegexComparison('stricter', 'Generated literal alternatives are a subset')
        if right > left: return RegexComparison('broader', 'Generated literal alternatives are a superset')
    if ac == bc:
        if aa > ba: return RegexComparison('broader', 'Generated pattern omits anchors')
        if aa < ba: return RegexComparison('stricter', 'Generated pattern adds anchors')
    schemes = {'https?': {'http', 'https'}, '(https?|ftp)': {'http', 'https', 'ftp'}, '(?:https?|ftp)': {'http', 'https', 'ftp'}, 'http': {'http'}, 'https': {'https'}}
    for x, sx in schemes.items():
        for y, sy in schemes.items():
            if a.startswith('^' + x + '://') and b.startswith('^' + y + '://') and a[len(x)+4:] == b[len(y)+4:]:
                if sy < sx: return RegexComparison('stricter', 'Generated protocol alternatives are a subset')
                if sy > sx: return RegexComparison('broader', 'Generated protocol alternatives are a superset')
    zip5 = {r'^\d{5}$', r'^[0-9]{5}$'}
    zip9 = {r'^\d{5}(-\d{4})?$', r'^\d{5}(?:-\d{4})?$', r'^[0-9]{5}(-[0-9]{4})?$'}
    # Do not equate Unicode \d with ASCII [0-9].
    if ('\\d' in a) == ('\\d' in b):
        if a in zip9 and b in zip5: return RegexComparison('stricter', 'Optional ZIP+4 suffix omitted')
        if a in zip5 and b in zip9: return RegexComparison('broader', 'Optional ZIP+4 suffix added')
    if re.fullmatch(r'\^?[A-Za-z0-9]+\$?', a) and re.fullmatch(r'\^?[A-Za-z0-9]+\$?', b):
        return RegexComparison('different', 'Different literal patterns')
    return RegexComparison('unknown', 'No supported deterministic equivalence rule')
