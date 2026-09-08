"""Deterministic descriptions of existing aggregates; no evaluation or external calls."""
import math

SECTIONS = ('overview', 'model_findings', 'strategy_findings', 'dimension_findings',
            'reliability_findings', 'hallucination_findings', 'agreement_findings',
            'error_findings', 'ground_truth_notes', 'limitations')


def variant_findings(data):
    findings = []
    for pair in data['comparisons']:
        delta = pair['accuracy_delta_percentage_points']
        if delta is None: continue
        n = pair['accuracy_matched_n']
        findings.append({'finding_type': 'variant_delta', 'title': 'Experiment Variant comparison',
            'text': f'For {pair["model"]}, {pair["variant_b"]} was associated with a {delta:+.2f} percentage-point accuracy difference over {pair["variant_a"]} across {n} complete matched cases.'
                    + (' Evidence is limited by the small matched sample (fewer than 5).' if n<5 else ''),
            'supporting_metric': 'accuracy_delta_percentage_points', 'value': delta, 'evidence_count': n,
            'model': pair['model'], 'metadata_context': {'key': data['metadata_key'], 'variant_a': pair['variant_a'], 'variant_b': pair['variant_b']}})
    if not findings:
        findings.append({'finding_type': 'unavailable', 'title': 'Experiment Variant comparison', 'text': data['reason'] or 'No complete accuracy pairs available.',
                         'supporting_metric': 'accuracy_delta_percentage_points', 'value': None, 'evidence_count': 0})
    return findings


def research_summary(data, scope=None):
    output = {section: [] for section in SECTIONS}
    def emit(section, kind, title, text, metric, value=None, count=0, **context):
        output[section].append({'finding_type': kind, 'title': title, 'text': text,
            'supporting_metric': metric, 'value': value, 'evidence_count': count, **context})

    def numeric(value):
        return isinstance(value, (int, float)) and not isinstance(value, bool) and math.isfinite(value)

    def limited(count, context):
        # A descriptive disclosure convention, not a statistical adequacy test.
        if 0 < count < 5:
            emit('limitations', 'small_sample', 'Limited observations',
                 f'{context} uses {count} observations. Interpret this small descriptive sample cautiously; the disclosure cutoff is 5, not a statistical threshold.',
                 'evidence_count', count, count)

    def extrema(section, items, key, label, identity, count_key='response_count', context=None):
        valid = [item for item in items if numeric(item.get(key))]
        if not valid: return
        for direction, pick in [('highest', max), ('lowest', min)]:
            target = pick(item[key] for item in valid)
            tied = [item for item in valid if item[key] == target]
            names = ', '.join(str(item[identity]) for item in tied)
            prefix = f'{context}: ' if context else ''
            emit(section, f'{direction}_{key}', f'{direction.title()} {label}',
                 f'{prefix}{names} recorded the {direction} observed {label} at {target:.2f}%'
                 + (' (tied).' if len(tied) > 1 else '.'), key, target,
                 sum(item.get(count_key, 0) for item in tied),
                 metadata_context={'entities': [item[identity] for item in tied], 'scope': context})

    total = data['response_count']
    emit('overview', 'scope', 'Analysis scope',
         f'The current scope contains {total} responses, {data["total_unique_cases"]} case IDs and {data["total_models"]} models.',
         'response_count', total, total)
    for key, label, count_key in [('average_overall_accuracy', 'Overall Accuracy', 'accuracy_evidence_count'),
                                 ('reliability', 'Reliability', 'reliability_evidence_count'),
                                 ('hallucination_rate', 'Hallucination Rate', 'response_count')]:
        val = data.get(key)
        if numeric(val) and total:
            emit('overview', key, label, f'Global {label} is {val:.2f}%.', key, val, data.get(count_key, 0))
        else:
            emit('overview', 'unavailable', label, f'{label}: Not Available; no eligible scored observations.', key)
    limited(total, 'This analysis')
    emit('limitations', 'descriptive_only', 'Descriptive interpretation',
         'These findings describe observed aggregates only. Rankings do not establish causes or population-level differences. Model and metadata groups may contain different case populations.',
         'interpretation_policy')
    models = data['models']
    extrema('overview', models, 'average_overall_accuracy', 'average Overall Accuracy', 'model', 'accuracy_evidence_count')
    for item in models:
        name = item['model']
        if numeric(item.get('average_overall_accuracy')) and numeric(item.get('reliability')) and item['average_overall_accuracy'] > item['reliability']:
            emit('reliability_findings', 'accuracy_execution_gap', f'{name}: accuracy and execution',
                 f'{name} recorded {item["average_overall_accuracy"]:.2f}% Overall Accuracy and a lower execution Reliability of {item["reliability"]:.2f}%. These measure different aspects of the responses.',
                 'reliability', item['reliability'], item.get('reliability_evidence_count', 0),
                 comparison_value=item['average_overall_accuracy'], model=name)
        for key, label, count_key in [('average_overall_accuracy', 'Overall Accuracy', 'accuracy_evidence_count'),
                                     ('reliability', 'Reliability', 'reliability_evidence_count'),
                                     ('hallucination_rate', 'Hallucination Rate', 'response_count')]:
            if numeric(item.get(key)):
                emit('model_findings', key, f'{name}: {label}', f'{name} recorded {label} of {item[key]:.2f}%.',
                     key, item[key], item.get(count_key, 0), model=name)
        for key, val in sorted(item['average_component_scores'].items()):
            if numeric(val):
                emit('model_findings', 'component_average', f'{name}: {key}',
                     f'{name} has an accepted {key} component average of {val:.4g} on its stored score scale. Component scales are not assumed comparable.',
                     f'average_component_scores.{key}', val, item.get('component_evidence_counts', {}).get(key, 0), model=name)
        limited(item['response_count'], f'Model {name}')
    extrema('reliability_findings', models, 'reliability', 'Reliability', 'model', 'reliability_evidence_count')
    emit('reliability_findings', 'definition', 'Execution is separate from correctness',
         'Reliability counts accepted execution scores equal to 1 among responses with an execution score; it does not measure semantic correctness.', 'reliability')
    emit('limitations', 'score_scales', 'Run-specific score scales',
         'Overall Accuracy uses each run’s metric configuration. Raw component averages can pool different run scales; do not assume they are directly comparable across components or configurations.', 'metric_configuration')
    extrema('hallucination_findings', models, 'hallucination_rate', 'Hallucination Rate', 'model')
    for name, count in sorted(data['hallucinated_functions'].items(), key=lambda pair: (-pair[1], pair[0]))[:5]:
        emit('hallucination_findings', 'function_occurrence', 'Recorded hallucinated function',
             f'{name} was recorded as hallucinated in {count} responses.', 'hallucinated_functions', count, count,
             metadata_context={'function': name})

    for section, summary_key, group_key, label in [
            ('strategy_findings', 'strategy_summary', 'strategies', 'strategy'),
            ('dimension_findings', 'dimension_summary', 'dimensions', 'dimension')]:
        groups = data.get(group_key, [])
        if not groups:
            emit(section, 'unavailable', 'Not Available', f'No {label} metadata observations are available for the selected metadata key.', group_key)
            emit('limitations', 'missing_metadata', f'Missing {label} metadata',
                 f'{label.title()} interpretation is unavailable. Select an available metadata key or supply corresponding benchmark metadata.', group_key)
            continue
        summaries = data.get(summary_key, [])
        extrema(section, summaries, 'average_overall_accuracy', 'average Overall Accuracy', 'value', 'accuracy_evidence_count', f'Across {label} groups (unmatched descriptive averages)')
        for model in sorted({item['model'] for item in groups}):
            scoped = [item for item in groups if item['model'] == model]
            extrema(section, scoped, 'average_overall_accuracy', 'average Overall Accuracy', 'value', 'accuracy_evidence_count', f'Model {model}, {label}')
        for key, metric_label in [('reliability', 'Reliability'), ('hallucination_rate', 'Hallucination Rate')]:
            extrema(section, summaries, key, metric_label, 'value',
                    'reliability_evidence_count' if key == 'reliability' else 'response_count', f'Across {label} groups')

    for delta in data['strategy_deltas']:
        count = delta['matched_case_count']
        context = {'strategy_a': delta['strategy_a'], 'strategy_b': delta['strategy_b']}
        if not numeric(delta['delta']):
            emit('strategy_findings', 'unavailable_delta', 'Matched comparison unavailable',
                 f'{delta["model"]}: {delta["strategy_a"]} to {delta["strategy_b"]}: {delta.get("reason") or "No comparable matched cases"}.',
                 'delta', count=count, model=delta['model'], metadata_context=context)
            continue
        emit('strategy_findings', 'matched_delta', 'Matched-case Accuracy Delta',
             f'For {delta["model"]}, {delta["strategy_b"]} was associated with a {delta["delta"]:+.2f} percentage-point difference relative to {delta["strategy_a"]} across {count} matched cases ({delta["average_a"]:.2f}% to {delta["average_b"]:.2f}%).',
             'delta', delta['delta'], count, comparison_value=delta['average_a'], model=delta['model'], metadata_context=context)
        limited(count, f'{delta["model"]}: {delta["strategy_a"]} to {delta["strategy_b"]}')

    pairs = data['agreement']
    valid = [p for p in pairs if numeric(p.get('agreement_rate')) and p['comparable_count'] > 0]
    if not valid:
        emit('agreement_findings', 'unavailable', 'Agreement Not Available', 'No comparable model pairs have an agreement rate in this scope.', 'agreement_rate')
    for direction, pick in [('highest', max), ('lowest', min)]:
        if not valid: break
        target = pick(p['agreement_rate'] for p in valid)
        for pair in valid:
            if pair['agreement_rate'] != target: continue
            emit('agreement_findings', f'{direction}_agreement', f'{direction.title()} observed agreement',
                 f'{pair["model_a"]} / {pair["model_b"]} recorded {target:.2f}% function-set agreement across {pair["comparable_count"]} comparable cases'
                 + (f' under {pair["strategy"]}' if pair['strategy'] is not None else '') + ' (ties retained).',
                 'agreement_rate', target, pair['comparable_count'], metadata_context={k: pair[k] for k in ('model_a', 'model_b', 'strategy')})
    for pair in pairs:
        if pair['non_comparable_count']:
            emit('limitations', 'non_comparable', 'Non-comparable agreement observations',
                 f'{pair["model_a"]} / {pair["model_b"]}: {pair["non_comparable_count"]} of {pair["matched_case_count"]} matched observations were non-comparable; these include ambiguous or unparseable outputs and are not counted as agreement.',
                 'non_comparable_count', pair['non_comparable_count'], pair['matched_case_count'], metadata_context={'strategy': pair['strategy']})
        limited(pair['comparable_count'], f'Agreement {pair["model_a"]} / {pair["model_b"]}')
    for item in data.get('agreement_summary', []):
        if numeric(item['agreement_rate']):
            emit('agreement_findings', 'strategy_agreement', 'Agreement by strategy',
                 f'{item["strategy"] if item["strategy"] is not None else "Unstratified scope"}: aggregate pairwise function-set agreement is {item["agreement_rate"]:.2f}% across {item["comparable_count"]} comparable pair-case observations.',
                 'agreement_rate', item['agreement_rate'], item['comparable_count'], metadata_context={'strategy': item['strategy']})

    def errors(items, context, model=None):
        if not items: return
        maximum = max(e['count'] for e in items)
        for error in items:
            if error['count'] != maximum: continue
            emit('error_findings', 'common_error', 'Most frequent error tag',
                 f'{context}: {error["tag"]} occurred in {error["count"]} responses ({error["percentage"]:.2f}%; ties retained).',
                 'error_occurrence_count', error['count'], error['count'], model=model,
                 metadata_context={'scope': context, 'error_tag': error['tag']})
    errors(data['errors'], 'Current scope')
    for item in models: errors(item['errors'], f'Model {item["model"]}', item['model'])
    for key in ('strategies', 'dimensions'):
        for item in data[key]: errors(item['errors'], f'{key}: {item["value"]}, model {item["model"]}', item['model'])
    emit('error_findings', 'multi_label', 'Multi-label error counts',
         'One response may have multiple error tags. Error occurrence percentages need not sum to 100%.', 'error_distribution_policy')
    truth = data.get('ground_truth_summary', {})
    count = truth.get('warning_count', 0)
    emit('ground_truth_notes', 'warning_scope', 'Ground-truth review notes',
         f'{truth.get("flagged_cases", 0)} case IDs contain ground-truth warnings and may require researcher review. There are {count} stored warning occurrences across model results in the pre-exclusion scope. Flagged cases are {"included" if data["include_ground_truth_warnings"] else "excluded"}; {data["filtered_results"]} responses / {data["filtered_cases"]} case IDs were filtered.',
         'ground_truth_summary.warning_count', count, count)
    for kind, occurrences in sorted(truth.get('warning_type_counts', {}).items(), key=lambda p: (-p[1], p[0]))[:5]:
        emit('ground_truth_notes', 'warning_type', 'Recorded warning type',
             f'{kind}: {occurrences} stored warning occurrences across model results (not unique-case counts).',
             'warning_type_counts', occurrences, occurrences, metadata_context={'warning_type': kind})
    if count:
        emit('limitations', 'ground_truth_warnings', 'Reference review may be needed',
             'Ground-truth warnings are advisory; they do not establish that a benchmark case is incorrect.', 'ground_truth_summary.warning_count', count, count)
    return {'scope': scope or {}, **output}
