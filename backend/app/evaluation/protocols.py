"""Reusable configurations. Runs retain independent JSON snapshots."""
from datetime import datetime
from typing import Literal
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import DateTime, ForeignKey, JSON
from sqlalchemy.orm import Mapped, mapped_column
from app.db import Base
from app.models.project import utc_now
from app.evaluation.metrics import MetricProfile, defaults


class StatisticalSettings(BaseModel):
    model_config = ConfigDict(extra='forbid')
    enabled: bool = False
    alpha: float = Field(default=.05, gt=0, lt=1, allow_inf_nan=False)
    correction: Literal['none', 'holm'] = 'holm'


class ProtocolConfiguration(MetricProfile):
    model_config = ConfigDict(extra='forbid')
    include_ground_truth_warnings: bool = True
    analysis_metadata_keys: dict[str, str] = Field(default_factory=dict)
    variant_metadata_key: str | None = None
    statistics: StatisticalSettings = Field(default_factory=StatisticalSettings)
    evaluator_version: Literal['1'] = '1'


class ProtocolRequest(BaseModel):
    model_config = ConfigDict(extra='forbid', str_strip_whitespace=True)
    name: str = Field(min_length=1, max_length=200)
    description: str = ''
    configuration: ProtocolConfiguration
    expected_version: int | None = Field(default=None, ge=1)


class SavedEvaluationProtocol(Base):
    __tablename__ = 'saved_evaluation_protocols'
    id: Mapped[int] = mapped_column(primary_key=True)
    project_id: Mapped[int] = mapped_column(ForeignKey('projects.id'), index=True)
    name: Mapped[str]
    description: Mapped[str] = mapped_column(default='')
    version: Mapped[int] = mapped_column(default=1)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utc_now)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=utc_now)
    configuration: Mapped[dict] = mapped_column(JSON)


def study_default():
    return ProtocolConfiguration(metrics=defaults()).model_dump()
