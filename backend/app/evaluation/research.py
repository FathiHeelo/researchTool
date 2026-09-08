"""Read-only analytics over persisted evidence and accepted decisions."""
from collections import Counter, defaultdict
from itertools import combinations
import ast
from sqlalchemy import select
from app.models.evaluation import EvaluationResult, EvaluationRun
from app.evaluation.review import reviewed_results
from app.evaluation.parser import parse_rules


def metadata(result):
    raw = result.snapshot.get('case', {}).get('metadata', [])
    if isinstance(raw, dict):
        return raw
    return {str(e.get('label', e.get('key'))): e.get('value') for e in raw
            if isinstance(e, dict) and isinstance(e.get('label', e.get('key')), str)} if isinstance(raw, list) else {}


def case_signature(result):
    """Case IDs alone must not match unrelated benchmarks across imports."""
    return (result.requirement, str(result.snapshot.get('case', {}).get('expected_rule')))


def records(session, project_id, run_id=None, model=None, include_ground_truth_warnings=True):
    query = select(EvaluationResult).join(EvaluationRun).where(EvaluationRun.project_id == project_id)
    if run_id is not None: query = query.where(EvaluationResult.run_id == run_id)
    if model is not None: query = query.where(EvaluationResult.model == model)
    rows = reviewed_results(session, session.scalars(query).all())
    excluded = [(r, d) for r, d in rows if not include_ground_truth_warnings and d['ground_truth_warning']]
    return [(r, d) for r, d in rows if include_ground_truth_warnings or not d['ground_truth_warning']], excluded


def average(values):
    values = [v for v in values if isinstance(v, (int, float))]
    return sum(values) / len(values) if values else None


def summary(rows):
    count = len(rows)
    execution = [d['accepted_scores'].get('execution') for _, d in rows]
    eligible = [v for v in execution if isinstance(v, (float, int))]
    errors = Counter(tag for _, d in rows for tag in dict.fromkeys(d['error_tags']))
    keys = sorted({k for _, d in rows for k in d['accepted_scores']})
    return {'response_count': count, 'average_overall_accuracy': average([d['accepted_overall_accuracy'] for _, d in rows]),
            'accuracy_evidence_count': sum(isinstance(d['accepted_overall_accuracy'], (int, float)) for _, d in rows),
            'reliability_evidence_count': len(eligible),
            'component_evidence_counts': {k: sum(isinstance(d['accepted_scores'].get(k), (int, float)) for _, d in rows) for k in keys},
            'reliability': eligible.count(1) / len(eligible) * 100 if eligible else None,
            'hallucination_count': sum(r.hallucination_detected for r, _ in rows),
            'hallucination_rate': sum(r.hallucination_detected for r, _ in rows) / count * 100 if count else 0,
            'average_component_scores': {k: average([d['accepted_scores'].get(k) for _, d in rows]) for k in keys},
            'errors': [{'tag': k, 'count': v, 'percentage': v / count * 100} for k, v in errors.most_common()]}


def grouped(rows, key):
    groups = defaultdict(list)
    for r, d in rows:
        value = metadata(r).get(key)
        if value is not None: groups[(r.model, str(value))].append((r, d))
    return [{'model': m, 'value': v, **summary(items)} for (m, v), items in sorted(groups.items())]


def analytics(session, project_id, run_id=None, model=None, include_ground_truth_warnings=True,
              strategy_key=None, dimension_key=None, group_key=None):
    rows, excluded = records(session, project_id, run_id, model, include_ground_truth_warnings)
    models = sorted({r.model for r, _ in rows})
    strategies = grouped(rows, strategy_key) if strategy_key else []
    deltas = []
    for name in models:
        groups = defaultdict(lambda: defaultdict(list))
        for r, d in rows:
            value = metadata(r).get(strategy_key)
            if r.model == name and value is not None:
                groups[str(value)][r.case_id].append((d['accepted_overall_accuracy'], case_signature(r)))
        for a, b in combinations(sorted(groups), 2):
            matched = sorted(set(groups[a]) & set(groups[b]))
            shared = len(matched)
            matched = [c for c in matched if len({signature for _,signature in groups[a][c]+groups[b][c]}) == 1
                       and average([v for v,_ in groups[a][c]]) is not None and average([v for v,_ in groups[b][c]]) is not None]
            av = average([average([v for v,_ in groups[a][c]]) for c in matched])
            bv = average([average([v for v,_ in groups[b][c]]) for c in matched])
            deltas.append({'model': name, 'strategy_a': a, 'strategy_b': b, 'matched_case_count': len(matched),
                           'average_a': av, 'average_b': bv, 'delta': bv-av if matched else None,
                           'non_comparable_case_count': shared-len(matched),
                           'reason': None if matched else 'No matched cases with consistent references and scores'})
    pairs = []
    strategy_values = sorted({str(metadata(r)[strategy_key]) for r, _ in rows if strategy_key in metadata(r)}) if strategy_key else [None]
    for strategy in strategy_values:
        by_model = defaultdict(lambda: defaultdict(list))
        for r, _ in rows:
            if strategy_key and str(metadata(r).get(strategy_key)) != strategy: continue
            parsed = parse_rules(str(r.snapshot.get('response', {}).get('generated_output') or ''))
            normalized = None
            if parsed.syntax_valid and parsed.calls:
                tree = ast.parse(parsed.original_text)
                if len(tree.body) == len(parsed.calls) and all(isinstance(n, ast.Expr) and isinstance(n.value, ast.Call) for n in tree.body):
                    normalized = frozenset(c.function.split('.')[-1] for c in parsed.calls)
            by_model[r.model][r.case_id].append((normalized, case_signature(r)))
        for a, b in combinations(models, 2):
            matched = set(by_model[a]) & set(by_model[b])
            comparable = agree = 0
            for case in matched:
                left, right = by_model[a][case], by_model[b][case]
                # Repeated cases across runs are ambiguous; never silently pair them.
                if len(left) == len(right) == 1 and left[0][0] is not None and right[0][0] is not None and left[0][1] == right[0][1]:
                    comparable += 1; agree += left[0][0] == right[0][0]
            pairs.append({'model_a': a, 'model_b': b, 'strategy': strategy, 'matched_case_count': len(matched),
                          'comparable_count': comparable, 'non_comparable_count': len(matched)-comparable,
                          'agreement_rate': agree/comparable*100 if comparable else None,
                          'reason': None if comparable else 'No unambiguous parseable matched cases'})
    dimensions = grouped(rows, dimension_key) if dimension_key else []
    warning_rows = [(r, d) for r, d in rows + excluded if d['ground_truth_warning']]
    warning_types = Counter(w['warning_type'] for _, d in warning_rows for w in d['ground_truth_warnings'])
    dimension_values = sorted({i['value'] for i in dimensions})
    agreement_summary = []
    for strategy in strategy_values:
        items = [p for p in pairs if p['strategy'] == strategy]
        comparable = sum(p['comparable_count'] for p in items)
        agreement_summary.append({'strategy': strategy, 'comparable_count': comparable,
            'matched_case_count': sum(p['matched_case_count'] for p in items),
            'non_comparable_count': sum(p['non_comparable_count'] for p in items),
            'agreement_rate': sum((p['agreement_rate'] or 0)*p['comparable_count'] for p in items)/comparable if comparable else None})
    return {**summary(rows), 'total_unique_cases': len({r.case_id for r, _ in rows}), 'total_models': len(models),
            'models': sorted([{'model': m, **summary([(r,d) for r,d in rows if r.model == m])} for m in models], key=lambda x: -(x['average_overall_accuracy'] or 0)),
            'metadata_keys': sorted({k for r,_ in rows for k in metadata(r)}),
            'strategies': strategies, 'strategy_deltas': deltas, 'dimensions': dimensions,
            'strategy_summary': [{'value': v, **summary([(r,d) for r,d in rows if str(metadata(r).get(strategy_key)) == v])}
                                 for v in sorted({item['value'] for item in strategies})],
            'ground_truth_summary': {'warning_count': sum(len(d['ground_truth_warnings']) for _,d in warning_rows),
                                     'flagged_cases': len({r.case_id for r,_ in warning_rows}),
                                     'warning_type_counts': dict(sorted(warning_types.items()))},
            'dimension_summary': [{'value': v, **summary([(r,d) for r,d in rows if str(metadata(r).get(dimension_key)) == v])} for v in dimension_values],
            'groups': grouped(rows, group_key) if group_key else [], 'agreement': pairs, 'agreement_summary': agreement_summary,
            'hallucinated_functions': dict(Counter(f for r,_ in rows for f in set(r.hallucinated_functions))),
            'include_ground_truth_warnings': include_ground_truth_warnings,
            'ground_truth_warning_results': sum(d['ground_truth_warning'] for _,d in rows),
            'filtered_results': len(excluded), 'filtered_cases': len({r.case_id for r,_ in excluded})}
