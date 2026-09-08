"""In-memory replication archives, using existing export and analytics services."""
import csv
import hashlib
import io
import json
import re
import zipfile
from datetime import datetime, timezone
from sqlalchemy import select
from fastapi.encoders import jsonable_encoder
from app.models.evaluation import EvaluationResult, GroundTruthValidation, RaterReviewDecision
from app.evaluation.research import records, analytics, metadata
from app.evaluation.export import export_run, safe_csv
from app.evaluation.statistics import statistical_comparison


def sanitize(value):
    """No environment is read. Remove labeled secrets and recognizable local paths.

    Redactions are disclosed in audit/README; arbitrary research metadata otherwise
    survives. This is not a semantic detector of unlabeled confidential prose.
    """
    sensitive = re.compile(r'(?i)(?:^|[^a-z])(api[ _-]?key|access[ _-]?token|token|password|secret|credential|authorization|environment|local[ _-]?path|file[ _-]?path)(?:$|[^a-z])')
    if isinstance(value,dict):
        # Metadata is often represented as label/value entries rather than a map.
        secret_label = any(sensitive.search(str(value.get(k,''))) for k in ('label','key','name'))
        return {str(k): '[REDACTED]' if sensitive.search(str(k)) or (secret_label and k=='value') else sanitize(v) for k,v in value.items()}
    if isinstance(value,(list,tuple)):return [sanitize(v) for v in value]
    if isinstance(value,str):
        if value.startswith('/') and not value.startswith('//www.'):
            return '[LOCAL PATH REDACTED]'
        text=re.sub(r'(?i)(?:[a-z]:[\\/]|\\\\)[^\s\"\'<>|,;]+','[LOCAL PATH REDACTED]',value)
        text=re.sub(r'(?<![\w:/])/(?:[^\s\"\'<>|,;]+/)+[^\s\"\'<>|,;]*','[LOCAL PATH REDACTED]',text)
        text=re.sub(r'(?i)\b(?:api[_ -]?key|(?:access[_ -]?)?token|password|secret|authorization)[\"\']?\s*[:=]\s*[\"\']?[^\s,;\"\']+','[CREDENTIAL REDACTED]',text)
        text=re.sub(r'\b(?:sk-[A-Za-z0-9_-]{12,}|Bearer\s+[A-Za-z0-9._-]+)','[CREDENTIAL REDACTED]',text)
        return text
    return value


def audit_run(session, run, include_ground_truth_warnings=True):
    rows=session.scalars(select(EvaluationResult).where(EvaluationResult.run_id==run.id)).all()
    validations=session.scalars(select(GroundTruthValidation).join(EvaluationResult).where(EvaluationResult.run_id==run.id)).all()
    known={v.result_id:v for v in validations}
    selected=[r for r in rows if include_ground_truth_warnings or not (known.get(r.id) and known[r.id].warnings)]
    warnings=[];checks=[]
    def check(key,condition,message):
        checks.append({'key':key,'passed':bool(condition)})
        if not condition:warnings.append(message)
    summary=run.summary or {}
    check('evaluator_version',bool(summary.get('evaluator_version')),'Evaluator version is missing for this legacy run.')
    check('metric_configuration',bool(summary.get('metric_configuration')),'Metric configuration snapshot is missing.')
    protocol=summary.get('protocol_snapshot')
    check('protocol_snapshot',bool(protocol and protocol.get('configuration') and protocol.get('protocol_version')),'Protocol snapshot/version is missing for this legacy run.')
    check('source_evidence',all(r.requirement and r.snapshot.get('case',{}).get('expected_rule') is not None and r.snapshot.get('response',{}).get('generated_output') is not None for r in selected),'Some selected results have missing requirement, expected rule, or generated output.')
    for key,condition,message in [
        ('case_ids',all(r.case_id for r in selected),f'{sum(not r.case_id for r in selected)} results are missing Case IDs.'),
        ('models',all(r.model for r in selected),'Some model labels are missing.'),
        ('metadata',all('metadata' in r.snapshot.get('case',{}) for r in selected),'Some results lack imported metadata; optional analyses may be unavailable.'),
        ('provenance',all(r.evaluation.get('provenance',{}).get('evaluation_origin') in ('evaluated','reused') for r in selected),'Some legacy results have no evaluation/reuse provenance.'),
        ('score_distinction',all(isinstance(r.scores,dict) for r in selected),'Automated score records are missing.'),
        ('ground_truth_state',all(r.id in known for r in selected),'Ground-truth validation state is missing for some results.')]:check(key,condition,message)
    flagged=len({r.case_id for r in rows if known.get(r.id) and known[r.id].warnings})
    if flagged:warnings.append(f'{flagged} case IDs contain advisory ground-truth warnings; flagged cases are '+('included.' if include_ground_truth_warnings else 'excluded.'))
    if any(sanitize(r.snapshot)!=r.snapshot or sanitize(r.requirement)!=r.requirement for r in selected):
        warnings.append('Recognizable secrets/local paths in research evidence will be redacted in package files.')
    if not selected:warnings.append('No results remain in the selected scope.')
    return {'status':'READY_WITH_WARNINGS' if warnings else 'READY','checks':checks,'warnings':warnings,
            'selected_results':len(selected),'filtered_results':len(rows)-len(selected),'ground_truth_warning_cases':flagged,
            'include_ground_truth_warnings':include_ground_truth_warnings}


def csv_bytes(items):
    items=sanitize(jsonable_encoder(items))
    keys=list(dict.fromkeys(k for item in items for k in item))
    stream=io.StringIO(newline='')
    writer=csv.DictWriter(stream,fieldnames=keys);writer.writeheader()
    writer.writerows({k:safe_csv(v) for k,v in item.items()} for item in items)
    return stream.getvalue().encode('utf-8-sig')


def zip_bytes(files):
    output=io.BytesIO()
    with zipfile.ZipFile(output,'w',compression=zipfile.ZIP_DEFLATED) as archive:
        for name,content in sorted(files.items()):
            info=zipfile.ZipInfo(name,date_time=(1980,1,1,0,0,0));info.compress_type=zipfile.ZIP_DEFLATED
            archive.writestr(info,content)
    return output.getvalue()


def canonical_xlsx(content, timestamp):
    # Normalize only archive metadata, never regenerate the workbook tables.
    with zipfile.ZipFile(io.BytesIO(content)) as source:
        files={name:source.read(name) for name in source.namelist()}
    if 'docProps/core.xml' in files:
        xml=files['docProps/core.xml'].decode()
        xml=re.sub(r'(<dcterms:(?:created|modified)[^>]*>)[^<]*(</dcterms:(?:created|modified)>)',lambda m:m[1]+timestamp+m[2],xml)
        files['docProps/core.xml']=xml.encode()
    return zip_bytes(files)


def replication_package(session, project, run, include_ground_truth_warnings=True, include_analysis=True, include_statistics=False, include_xlsx=True, generated_at=None):
    audit=audit_run(session,run,include_ground_truth_warnings)
    generated_at=generated_at or datetime.now(timezone.utc).replace(microsecond=0).isoformat()
    rows,_=records(session,project.id,run.id,include_ground_truth_warnings=include_ground_truth_warnings)
    summary=run.summary or {};protocol=summary.get('protocol_snapshot') or {};config=protocol.get('configuration') or {}
    keys=config.get('analysis_metadata_keys',{});strategy=keys.get('strategy');dimension=keys.get('dimension')
    files={}
    def put(name,content):files['replication_package/'+name]=content
    def put_json(name,value):put(name,json.dumps(sanitize(jsonable_encoder(value)),ensure_ascii=False,sort_keys=True,indent=2,allow_nan=False).encode())
    benchmark=[{'Case ID':r.case_id,'Source Row':r.snapshot.get('case',{}).get('original_row_number'),'Requirement':r.requirement,
                'Expected Rule':r.snapshot.get('case',{}).get('expected_rule'),'Model':r.model,
                'Model Source Column':r.snapshot.get('response',{}).get('source_column_name'),
                'Generated Output':r.snapshot.get('response',{}).get('generated_output'),'Metadata':r.snapshot.get('case',{}).get('metadata',[]),
                **{f'Metadata: {k}':v for k,v in metadata(r).items()}} for r,d in rows]
    if benchmark:put('data/benchmark.csv',csv_bytes(benchmark))
    put('data/detailed_results.csv',export_run(session,project,run,'csv',include_ground_truth_warnings,sanitizer=sanitize))
    put_json('configuration/metric_configuration.json',summary.get('metric_configuration'))
    put_json('configuration/evaluation_protocol.json',protocol)
    put_json('configuration/run_configuration.json',{k:summary.get(k) for k in ('mode','baseline_run_id','reused_count','reevaluated_count','failed_count','reuse_percentage')})
    put_json('configuration/evaluator_version.json',{k:summary.get(k) for k in ('evaluator_version','equivalence_version','gx_version')})
    if include_analysis:
        analysis=analytics(session,project.id,run.id,include_ground_truth_warnings=include_ground_truth_warnings,strategy_key=strategy,dimension_key=dimension)
        for filename,key in [('model_summary','models'),('strategy_analysis','strategies'),('dimension_analysis','dimensions'),('agreement','agreement'),('error_analysis','errors')]:
            if analysis[key]:put(f'analysis/{filename}.csv',csv_bytes(analysis[key]))
    if include_statistics:
        settings=config.get('statistics',{})
        if settings.get('enabled'):
            stats=statistical_comparison(session,project.id,run.id,include_ground_truth_warnings=include_ground_truth_warnings,
                                        enabled=True,alpha=settings.get('alpha',.05),correction=settings.get('correction','holm'))
            if stats['comparisons']:put('analysis/statistical_comparisons.csv',csv_bytes(stats['comparisons']))
        else:audit['warnings'].append('Statistical comparisons omitted: testing is not enabled in the run protocol snapshot.')
    warnings=[{'Case ID':r.case_id,'Model':r.model,'Requirement':r.requirement,'Expected Rule':r.snapshot.get('case',{}).get('expected_rule'),**w} for r,d in rows for w in d['ground_truth_warnings']]
    if warnings:put('review/ground_truth_warnings.csv',csv_bytes(warnings))
    overrides=[{'result_id':r.id,'case_id':r.case_id,'model':r.model,'actor':event.actor,'timestamp':event.created_at,'reason':event.reason,
                'previous':event.previous_value,'new':event.new_value} for r,d in rows for event in d['audit_history']]
    if overrides:put('review/manual_overrides.csv',csv_bytes(overrides))
    selected_ids={r.id for r,d in rows}
    raters=session.scalars(select(RaterReviewDecision).join(EvaluationResult).where(EvaluationResult.run_id==run.id).order_by(RaterReviewDecision.id)).all()
    raters=[r for r in raters if r.result_id in selected_ids]
    if raters:put('review/inter_rater_reviews.csv',csv_bytes(jsonable_encoder(raters)))
    if include_xlsx:
        try:put('exports/research_results.xlsx',canonical_xlsx(export_run(session,project,run,'xlsx',include_ground_truth_warnings,strategy,dimension,sanitizer=sanitize),generated_at))
        except ValueError:
            audit['warnings'].append('XLSX omitted because a field exceeds Excel limits; complete CSV evidence is included.')
    audit['status']='READY_WITH_WARNINGS' if audit['warnings'] else 'READY'
    put_json('reproducibility_audit.json',audit)
    included=sorted([name.removeprefix('replication_package/') for name in files]+['README.md','manifest.json'])
    readme=f'''# Replication package

Project: {sanitize(project.name)} (ID {project.id})
Run: {run.id}; run created at: {run.created_at.isoformat()}
Package generated at: {generated_at}
Evaluator version: {summary.get('evaluator_version','missing (legacy)')}
Case IDs: {len({r.case_id for r,d in rows})}; responses: {len(rows)}
Models: {json.dumps(sanitize(sorted({r.model for r,d in rows})),ensure_ascii=False)}
Protocol ID/version: {summary.get('protocol_id')} / {summary.get('protocol_version')}
Ground-truth flagged cases: {'included' if include_ground_truth_warnings else 'excluded'}
Accepted manual overrides present: {bool(overrides)}
Independent rater reviews present: {bool(raters)}

Overall Accuracy is the weighted normalized mean of enabled metrics times 100,
using the run metric snapshot and accepted overrides. Null required scores remain
unavailable. Legacy runs without a profile use their original equal-weight policy.
Automated, accepted, and individual rater decisions remain separate.

Metric configuration: configuration/metric_configuration.json
Protocol snapshot: configuration/evaluation_protocol.json
The benchmark CSV preserves available imported evidence in long form, not the
original uploaded binary. Recognizable credential fields and absolute local paths
are redacted and disclosed; no environment files or machine configuration are read.
CSV formula-leading strings are escaped for spreadsheet safety. Reused results
include their source provenance in detailed results. No evaluations were rerun.

For verification, calculate SHA-256 over each file's bytes and compare manifest.json.
The manifest excludes its own checksum (self-checksums are not meaningful).
This archive preserves evidence/configuration; it does not bundle application code.

Included files:
'''+'\n'.join('- '+name for name in included)+'\n'
    put('README.md',sanitize(readme).encode())
    manifest={'package_format_version':'1','project_id':project.id,'run_id':run.id,'evaluator_version':summary.get('evaluator_version'),
              'protocol_id':summary.get('protocol_id'),'protocol_version':summary.get('protocol_version'),
              'metric_configuration':sanitize(summary.get('metric_configuration')),'generated_at':generated_at,
              'files':[{'path':name,'sha256':hashlib.sha256(content).hexdigest(),'size':len(content)} for name,content in sorted(files.items())]}
    put_json('manifest.json',manifest)
    return zip_bytes(files)
