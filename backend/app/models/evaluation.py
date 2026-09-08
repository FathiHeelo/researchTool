from datetime import datetime
from sqlalchemy import DateTime, ForeignKey, JSON, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column
from app.db import Base
from app.models.project import utc_now


class EvaluationRun(Base):
    __tablename__ = 'evaluation_runs'
    id: Mapped[int] = mapped_column(primary_key=True)
    project_id: Mapped[int] = mapped_column(ForeignKey('projects.id'), index=True)
    status: Mapped[str] = mapped_column(String, default='pending')
    total_responses: Mapped[int]
    processed_responses: Mapped[int] = mapped_column(default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utc_now)
    started_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    failure_summary: Mapped[str | None] = mapped_column(nullable=True)
    summary: Mapped[dict] = mapped_column(JSON, default=dict)


class EvaluationResult(Base):
    __tablename__ = 'evaluation_results'
    id: Mapped[int] = mapped_column(primary_key=True)
    run_id: Mapped[int] = mapped_column(ForeignKey('evaluation_runs.id'), index=True)
    snapshot: Mapped[dict] = mapped_column(JSON)
    model: Mapped[str] = mapped_column(index=True)
    case_id: Mapped[str]
    requirement: Mapped[str]
    scores: Mapped[dict] = mapped_column(JSON)
    overall_accuracy: Mapped[float | None] = mapped_column(nullable=True)
    hallucination_detected: Mapped[bool] = mapped_column(default=False)
    hallucinated_functions: Mapped[list] = mapped_column(JSON, default=list)
    error_tags: Mapped[list] = mapped_column(JSON, default=list)
    notes: Mapped[list] = mapped_column(JSON, default=list)
    evaluation: Mapped[dict] = mapped_column(JSON)


class ReviewDecision(Base):
    __tablename__ = 'review_decisions'
    id: Mapped[int] = mapped_column(primary_key=True)
    result_id: Mapped[int] = mapped_column(ForeignKey('evaluation_results.id'), index=True)
    actor: Mapped[str]
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utc_now)
    reason: Mapped[str]
    previous_value: Mapped[dict] = mapped_column(JSON)
    new_value: Mapped[dict] = mapped_column(JSON)


class GroundTruthValidation(Base):
    __tablename__ = 'ground_truth_validations'
    id: Mapped[int] = mapped_column(primary_key=True)
    result_id: Mapped[int] = mapped_column(ForeignKey('evaluation_results.id'), unique=True, index=True)
    warnings: Mapped[list] = mapped_column(JSON)


class RaterReviewDecision(Base):
    """Append-only independent reviews; never read by accepted-score logic."""
    __tablename__ = 'rater_review_decisions'
    __table_args__ = (UniqueConstraint('result_id', 'rater_label', 'revision'),)
    id: Mapped[int] = mapped_column(primary_key=True)
    result_id: Mapped[int] = mapped_column(ForeignKey('evaluation_results.id'), index=True)
    rater_label: Mapped[str] = mapped_column(index=True)
    revision: Mapped[int]
    reason: Mapped[str]
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utc_now)
    previous_value: Mapped[dict] = mapped_column(JSON)
    new_value: Mapped[dict] = mapped_column(JSON)
    metric_configuration: Mapped[list] = mapped_column(JSON)
