"""Independent labels are a workflow convenience, not authentication."""
from collections import defaultdict
import json
import math
from pydantic import BaseModel, Field, ConfigDict, field_validator
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sklearn.metrics import cohen_kappa_score
from fastapi import HTTPException
from fastapi.encoders import jsonable_encoder
from app.models.evaluation import EvaluationRun, EvaluationResult, RaterReviewDecision
from app.evaluation.review import review_details


class RaterRequest(BaseModel):
    model_config = ConfigDict(extra='forbid', str_strip_whitespace=True)
    rater_label: str = Field(min_length=1, max_length=160)
    scores: dict[str, float] = Field(default_factory=dict)
    reason: str = Field(min_length=1)
    note: str | None = None
    error_tags: list[str] | None = None
    expected_revision: int = Field(default=0, ge=0)

    @field_validator('scores')
    @classmethod
    def finite_scores(cls, values):
        if any(not math.isfinite(v) for v in values.values()): raise ValueError('Scores must be finite')
        return values


def history(session, result_id):
    return session.scalars(select(RaterReviewDecision).where(RaterReviewDecision.result_id==result_id).order_by(RaterReviewDecision.id)).all()


def rater_view(session, result, label, independent=True):
    events = history(session, result.id)
    own = [e for e in events if e.rater_label==label]
    visible = events if not independent or own else own
    latest = {e.rater_label: e for e in visible}
    configuration = (session.get(EvaluationRun,result.run_id).summary or {}).get('metric_configuration', [])
    return {'result_id':result.id,'case_id':result.case_id,'model':result.model,'snapshot':result.snapshot,
            'automated_scores':result.scores,'metric_configuration':configuration,
            'accepted_scores':review_details(session,result)['accepted_scores'] if not independent or own else None,
            'independent_review_mode':independent,'other_reviews_hidden':bool(independent and not own),
            'own_review':jsonable_encoder(own[-1]) if own else None,
            'raters':jsonable_encoder(list(latest.values())), 'audit_history':jsonable_encoder(visible)}


def save_rater(session, result, data):
    events = [e for e in history(session,result.id) if e.rater_label==data.rater_label]
    last = events[-1] if events else None
    revision = last.revision if last else 0
    if data.expected_revision != revision: raise HTTPException(409,'This rater review changed. Reload before saving.')
    config = (session.get(EvaluationRun,result.run_id).summary or {}).get('metric_configuration', [])
    by_key = {m['key']:m for m in config}
    for key,value in data.scores.items():
        if key not in result.scores: raise HTTPException(400,'Unknown metric key for this result')
        scale = by_key.get(key, {'min_score':0,'max_score':1})
        if not scale['min_score']<=value<=scale['max_score'] or (scale.get('allowed_values') is not None and value not in scale['allowed_values']):
            raise HTTPException(400,'Rater score is outside the run metric scale')
    previous = last.new_value if last else {'scores':{},'note':'','error_tags':[]}
    state = {'scores':{**previous['scores'],**data.scores}, 'note':data.note if data.note is not None else previous['note'],
             'error_tags':data.error_tags if data.error_tags is not None else previous['error_tags']}
    event = RaterReviewDecision(result_id=result.id,rater_label=data.rater_label,revision=revision+1,reason=data.reason,
                               previous_value=previous,new_value=state,metric_configuration=config)
    session.add(event)
    try: session.commit()
    except IntegrityError:
        session.rollback();raise HTTPException(409,'Concurrent rater review. Reload before saving.')
    return rater_view(session,result,data.rater_label,True)


def metric_agreement(a, b, configuration):
    n = len(a)
    result = {'matched_n':n,'exact_agreement_count':sum(x==y for x,y in zip(a,b)),
              'exact_agreement_percentage':sum(x==y for x,y in zip(a,b))/n*100 if n else None,
              'mean_a':sum(a)/n if n else None,'mean_b':sum(b)/n if n else None,
              'kappa':None,'kappa_type':None,'status':'insufficient_data','reason':'At least two paired ratings are required.'}
    if n<2: return result
    scale = configuration.get('allowed_values')
    ordered = configuration.get('score_type') in ('ordinal','ordered')
    if scale is None and configuration.get('min_score',0)==0 and configuration.get('max_score',1)==1 and set(a+b)<={0,1}:
        scale=[0,1]
    if scale is None:
        result.update(status='not_applicable',reason='No declared categorical/ordered values. Raw means and exact agreement are reported.');return result
    scale=sorted(set(scale))
    if any(v not in scale for v in a+b):
        result.update(status='incompatible_configuration',reason='Ratings do not belong to the declared scale.');return result
    if len(set(a+b))==1:
        result.update(status='undefined',reason='Both raters use the same single category; expected agreement is one.');return result
    encoding={v:i for i,v in enumerate(scale)}
    weights='linear' if ordered and len(scale)>2 else None
    kappa=float(cohen_kappa_score([encoding[v] for v in a],[encoding[v] for v in b],labels=list(range(len(scale))),weights=weights))
    result.update(kappa=kappa if math.isfinite(kappa) else None,kappa_type='linear weighted Cohen' if weights else 'Cohen',
                  status='ok' if math.isfinite(kappa) else 'undefined',reason=None if math.isfinite(kappa) else 'Kappa is undefined for these marginal ratings.')
    return result


def agreement(session, run_id, rater_a, rater_b, metric=None):
    rows=session.scalars(select(EvaluationResult).where(EvaluationResult.run_id==run_id).order_by(EvaluationResult.id)).all()
    events=session.scalars(select(RaterReviewDecision).join(EvaluationResult).where(EvaluationResult.run_id==run_id).order_by(RaterReviewDecision.id)).all()
    labels=sorted({e.rater_label for e in events})
    latest={(e.result_id,e.rater_label):e for e in events}
    pairs=defaultdict(list);disagreements=[];joint=exact=comparable=0
    for r in rows:
        a,b=latest.get((r.id,rater_a)),latest.get((r.id,rater_b))
        if not a or not b:continue
        joint+=1
        x,y=a.new_value['scores'],b.new_value['scores']
        keys=(set(x)&set(y)) & ({metric} if metric else set(x)|set(y))
        if keys and (metric is not None or set(x)==set(y)):
            comparable+=1;exact+=all(x[k]==y[k] for k in keys)
        for k in sorted(keys):
            ca=next((m for m in a.metric_configuration if m['key']==k),{})
            cb=next((m for m in b.metric_configuration if m['key']==k),{})
            def signature(c):return {key:c.get(key) for key in ('min_score','max_score','score_type','allowed_values')}
            pairs[k].append((x[k],y[k],signature(ca),signature(cb)))
            if x[k]!=y[k]:
                disagreements.append({'result_id':r.id,'case_id':r.case_id,'model':r.model,'metric':k,'automated':r.scores.get(k),
                                      'rater_a':x[k],'rater_b':y[k],'difference':y[k]-x[k],
                                      'snapshot':r.snapshot,'review_a':jsonable_encoder(a),'review_b':jsonable_encoder(b)})
    metrics=[]
    for k,items in sorted(pairs.items()):
        signatures={json.dumps(c,sort_keys=True) for _,_,ca,cb in items for c in (ca,cb)}
        if len(signatures)>1:
            result={'matched_n':len(items),'status':'incompatible_configuration','reason':'Metric scales differ; pooled kappa/means are not reported.','kappa':None}
        else:result=metric_agreement([x for x,y,ca,cb in items],[y for x,y,ca,cb in items],items[0][2])
        metrics.append({'metric':k,**result})
    return {'raters':labels,'total_jointly_reviewed_results':joint,'comparable_results':comparable,'incomplete_results':joint-comparable,
            'exact_agreement_count':exact,'exact_agreement_rate':exact/comparable*100 if comparable else None,
            'disagreement_count':comparable-exact,'disagreement_rate':(comparable-exact)/comparable*100 if comparable else None,
            'metrics':metrics,'disagreements':disagreements,'status':'available' if comparable else 'insufficient_data'}
