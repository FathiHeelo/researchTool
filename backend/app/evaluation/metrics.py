"""Versioned metric profiles; historical runs own their configuration."""
import math
from pydantic import BaseModel, Field, model_validator
from sqlalchemy import ForeignKey, JSON
from sqlalchemy.orm import Mapped, mapped_column
from app.db import Base


class MetricConfiguration(BaseModel):
    key: str = Field(min_length=1)
    name: str
    description: str = ''
    enabled: bool = True
    weight: float = Field(default=1, ge=0, allow_inf_nan=False)
    score_type: str = 'number'
    min_score: float = Field(default=0, allow_inf_nan=False)
    max_score: float = Field(default=1, allow_inf_nan=False)
    allowed_values: list[float] | None = None
    evaluation_mode: str = 'automated'
    display_order: int = 0

    @model_validator(mode='after')
    def scale(self):
        if self.max_score <= self.min_score or not math.isfinite(self.max_score-self.min_score):
            raise ValueError('Maximum score must exceed minimum score')
        if self.allowed_values is not None and any(not math.isfinite(v) or not self.min_score <= v <= self.max_score for v in self.allowed_values):
            raise ValueError('Allowed values must be within the score scale')
        return self


class MetricProfile(BaseModel):
    metrics: list[MetricConfiguration]

    @model_validator(mode='after')
    def valid_weights(self):
        if len({m.key for m in self.metrics}) != len(self.metrics):
            raise ValueError('Metric keys must be unique')
        if not any(m.enabled and m.weight > 0 for m in self.metrics):
            raise ValueError('Enable at least one metric with a positive weight')
        return self


class ProjectMetricProfile(Base):
    __tablename__ = 'project_metric_profiles'
    project_id: Mapped[int] = mapped_column(ForeignKey('projects.id'), primary_key=True)
    metrics: Mapped[list] = mapped_column(JSON)


def defaults():
    return [MetricConfiguration(key=k, name=k.title(), weight=25, display_order=i).model_dump()
            for i, k in enumerate(('syntax', 'execution', 'semantic', 'completeness'))]


def current_profile(session, project_id):
    profile = session.get(ProjectMetricProfile, project_id)
    return sorted(profile.metrics if profile else defaults(), key=lambda m: m['display_order'])


def overall(scores, configuration=None):
    # Legacy runs retain the original equal-weight policy over their own keys.
    configuration = configuration if configuration is not None else [MetricConfiguration(key=k, name=k).model_dump() for k in scores]
    weighted = weight = 0
    largest_weight = max((m['weight'] for m in configuration if m['enabled']), default=0)
    for metric in configuration:
        if not metric['enabled'] or metric['weight'] <= 0:
            continue
        value = scores.get(metric['key'])
        if not isinstance(value, (int, float)) or not math.isfinite(value):
            return None
        if not metric['min_score'] <= value <= metric['max_score'] or (metric.get('allowed_values') is not None and value not in metric['allowed_values']):
            return None
        normalized_weight = metric['weight'] / largest_weight
        weighted += (value - metric['min_score']) / (metric['max_score'] - metric['min_score']) * normalized_weight
        weight += normalized_weight
    return round(weighted / weight * 100, 8) if weight else None
