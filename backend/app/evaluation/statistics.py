"""Paired-only scientific comparisons; descriptive values are always retained."""
from itertools import combinations
from statistics import mean, median
import scipy
from scipy.stats import wilcoxon, rankdata, binomtest
from app.evaluation.comparisons import match, paired_values, finite
from app.evaluation.research import records, metadata


def holm(p_values):
    """Step-down Holm adjustment, restored to input order."""
    adjusted = [None]*len(p_values)
    order = sorted((p,i) for i,p in enumerate(p_values) if p is not None)
    previous = 0
    for rank, (p,index) in enumerate(order):
        previous = max(previous, min(1, p*(len(order)-rank)))
        adjusted[index] = previous
    return adjusted


def paired_test(values, metric, enabled=True):
    values = [(a,b) for a,b in values if finite(a) and finite(b) and (metric=='overall_accuracy' or (a in (0,1) and b in (0,1)))]
    a, b = [v[0] for v in values], [v[1] for v in values]
    differences = [round(y-x, 8) for x,y in values]
    n = len(values)
    result = {'matched_n': n, 'mean_a': mean(a) if n else None, 'mean_b': mean(b) if n else None,
              'median_a': median(a) if n else None, 'median_b': median(b) if n else None,
              'mean_difference_percentage_points': mean(differences)*(100 if metric != 'overall_accuracy' else 1) if n else None,
              'median_difference': median(differences) if n else None, 'test_name': 'Wilcoxon signed-rank' if metric == 'overall_accuracy' else 'Exact McNemar',
              'statistic': None, 'p_value': None, 'raw_p_value': None, 'adjusted_p_value': None, 'effect_size': None,
              'status': 'insufficient_data', 'notes': [], 'scipy_version': scipy.__version__}
    if metric != 'overall_accuracy':
        result.update(discordant_a0_b1=sum(x==0 and y==1 for x,y in values), discordant_a1_b0=sum(x==1 and y==0 for x,y in values))
    if not enabled:
        result.update(status='disabled', notes=['Statistical testing is disabled; descriptive values remain available.']); return result
    if n < 6:
        result['notes'] = ['At least 6 complete paired observations are required by this conservative policy; this does not guarantee adequate study power.']; return result
    if metric == 'overall_accuracy':
        nonzero = [d for d in differences if d != 0]
        if len(nonzero)<6:
            result['notes'] = ['Fewer than 6 nonzero differences (including all-identical pairs); no formal test reported.']; return result
        test = wilcoxon(differences, zero_method='wilcox', alternative='two-sided', method='auto')
        ranks = rankdata([abs(d) for d in nonzero], method='average')
        result['effect_size'] = float(sum(rank*(1 if d>0 else -1) for rank,d in zip(ranks, nonzero))/sum(ranks))
        result['effect_size_name'] = 'paired rank-biserial correlation (B minus A)'
        result['notes'] = ['SciPy auto method; differences rounded to 8 decimal places; zero differences omitted from ranks.',
                           'Assumes independent paired research units and a symmetric difference distribution. Effect size is descriptive, not causal.']
        statistic, p = float(test.statistic), float(test.pvalue)
    else:
        ab = sum(x == 0 and y == 1 for x,y in values)
        ba = sum(x == 1 and y == 0 for x,y in values)
        result.update(discordant_a0_b1=ab, discordant_a1_b0=ba)
        if ab+ba == 0:
            result['notes'] = ['No discordant outcomes; no formal test reported.']; return result
        statistic, p = min(ab, ba), float(binomtest(ab, ab+ba, .5, alternative='two-sided').pvalue)
        result['notes'] = ['Exact two-sided conditional binomial McNemar test; statistic is the smaller discordant count. Binary means are proportions.']
    result.update(statistic=statistic, p_value=p, raw_p_value=p, status='ok')
    return result


def statistical_comparison(session, project_id, run_id=None, model=None, comparison_type='models', metric='overall_accuracy',
                           metadata_key=None, groups=None, include_ground_truth_warnings=True, enabled=False, alpha=.05, correction='holm'):
    rows,_ = records(session, project_id, run_id, model, True)
    buckets = {}
    for r,d in rows:
        value = r.model if comparison_type == 'models' else metadata(r).get(metadata_key)
        if value is not None: buckets.setdefault(str(value), []).append((r,d))
    names = sorted(buckets) if groups is None else sorted(set(groups))
    if any(n not in buckets for n in names): raise ValueError('A selected group is not available in this scope')
    comparisons = []
    for a,b in combinations(names, 2):
        pairs, counts = match(buckets[a], buckets[b], include_ground_truth_warnings)
        values = paired_values(pairs, metric)
        comparisons.append({'group_a': a, 'group_b': b, **counts, **paired_test(values, metric, enabled),
                            'invalid_pair_count': len(pairs)-len(values), 'final_matched_count': len(values)})
    adjusted = holm([c['raw_p_value'] for c in comparisons]) if correction == 'holm' else [c['raw_p_value'] for c in comparisons]
    for item, p in zip(comparisons, adjusted): item['adjusted_p_value'] = p
    return {'groups': sorted(buckets), 'comparisons': comparisons, 'comparison_type': comparison_type, 'metric': metric,
            'metadata_key': metadata_key, 'enabled': enabled, 'alpha': alpha, 'correction': correction,
            'family_size': sum(c['status'] == 'ok' for c in comparisons), 'include_ground_truth_warnings': include_ground_truth_warnings,
            'notes': ['Correction covers all successfully tested pairs in this request, not other exploratory requests.',
                      'Unmatched, ambiguous, reference-inconsistent and invalid-score pairs are disclosed and excluded.'],
            'status': 'available' if comparisons else 'insufficient_data'}
