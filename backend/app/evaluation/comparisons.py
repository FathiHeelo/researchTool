"""Shared conservative matching for descriptive and formal paired comparisons."""
from collections import defaultdict
from itertools import combinations
import math
from app.evaluation.research import records, metadata, case_signature, summary


def finite(value):
    return type(value) in (int, float) and math.isfinite(value)


def match(left, right, include_warnings=True):
    a, b = defaultdict(list), defaultdict(list)
    for item in left: a[item[0].case_id].append(item)
    for item in right: b[item[0].case_id].append(item)
    shared = sorted(set(a) & set(b))
    pairs = []; ambiguous = excluded = original = 0
    for key in shared:
        if len(a[key]) != 1 or len(b[key]) != 1 or case_signature(a[key][0][0]) != case_signature(b[key][0][0]):
            ambiguous += 1; continue
        original += 1
        x, y = a[key][0], b[key][0]
        if not include_warnings and (x[1]['ground_truth_warning'] or y[1]['ground_truth_warning']):
            excluded += 1; continue
        pairs.append((x, y))
    return pairs, {'original_matched_count': original, 'excluded_count': excluded, 'final_matched_count': len(pairs),
                   'unmatched_case_count': len(set(a) ^ set(b)), 'ambiguous_case_count': ambiguous}


def paired_values(pairs, metric):
    def value(item):
        result, details = item
        if metric == 'overall_accuracy': return details['accepted_overall_accuracy']
        if metric == 'hallucination': return int(result.hallucination_detected)
        return details['accepted_scores'].get(metric)
    values = [(value(a), value(b)) for a,b in pairs]
    return [(a,b) for a,b in values if finite(a) and finite(b) and (metric not in ('execution', 'hallucination') or (a in (0,1) and b in (0,1)))]


def difference(pairs, metric, percentage=False):
    values = paired_values(pairs, metric)
    n = len(values)
    factor = 100 if percentage else 1
    a = sum(a for a,b in values)/n*factor if n else None
    b = sum(b for a,b in values)/n*factor if n else None
    return {'a': a, 'b': b, 'delta': b-a if n else None, 'matched_n': n}


def variant_comparison(session, project_id, run_id=None, model=None, metadata_key=None, include_ground_truth_warnings=True):
    rows, _ = records(session, project_id, run_id, model, True)
    groups = defaultdict(list)
    for r,d in rows:
        val = metadata(r).get(metadata_key)
        if val is not None: groups[(r.model, str(val))].append((r,d))
    variants = sorted({v for _,v in groups})
    comparisons = []; matched_units = defaultdict(set)
    for name in sorted({m for m,v in groups}):
        for a,b in combinations(variants, 2):
            pairs, counts = match(groups[(name,a)], groups[(name,b)], include_ground_truth_warnings)
            for x,y in pairs:
                matched_units[a].add((name, x[0].case_id)); matched_units[b].add((name, y[0].case_id))
            accuracy = difference(pairs, 'overall_accuracy')
            reliability = difference(pairs, 'execution', True)
            hallucination = difference(pairs, 'hallucination', True)
            metrics = sorted({k for pair in pairs for _,d in pair for k in d['accepted_scores']})
            comparisons.append({'variant_a': a, 'variant_b': b, 'model': name, **counts, 'matched_case_count': len(pairs),
                'average_accuracy_a': accuracy['a'], 'average_accuracy_b': accuracy['b'], 'accuracy_delta_percentage_points': accuracy['delta'],
                'accuracy_matched_n': accuracy['matched_n'], 'reliability_a': reliability['a'], 'reliability_b': reliability['b'],
                'reliability_delta': reliability['delta'], 'reliability_matched_n': reliability['matched_n'],
                'hallucination_rate_a': hallucination['a'], 'hallucination_rate_b': hallucination['b'], 'hallucination_delta': hallucination['delta'],
                'component_differences': {k: difference(pairs, k) for k in metrics},
                'status': 'available' if pairs else 'unavailable',
                'notes': ['Only unambiguous matching Case IDs with identical requirements/references are compared. Each metric uses complete pairs. Component differences use stored raw scales.']})
    summaries = []
    for v in variants:
        items = [item for (m,value), items in groups.items() if value == v for item in items
                 if include_ground_truth_warnings or not item[1]['ground_truth_warning']]
        summaries.append({'variant': v, **summary(items), 'matched_cases': len({c for m,c in matched_units[v]}), 'matched_units': len(matched_units[v])})
    reason = 'Choose a variant metadata key.' if not metadata_key else 'Fewer than two variant values are available.' if len(variants)<2 else 'No comparable matched cases.' if not any(c['matched_case_count'] for c in comparisons) else None
    return {'metadata_key': metadata_key, 'include_ground_truth_warnings': include_ground_truth_warnings,
            'variants': variants, 'summaries': summaries, 'comparisons': comparisons,
            'status': 'unavailable' if reason else 'available', 'reason': reason}
