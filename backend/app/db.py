from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, sessionmaker

from app.config import settings


class Base(DeclarativeBase):
    pass


engine = create_engine(
    settings.database_url,
    connect_args={"check_same_thread": False} if settings.database_url.startswith("sqlite") else {},
)
SessionLocal = sessionmaker(bind=engine)


def init_db():
    from app.evaluation.protocols import SavedEvaluationProtocol  # noqa: F401
    from app.evaluation.metrics import ProjectMetricProfile  # noqa: F401
    from app.models.project import Project  # noqa: F401
    from app.models.evaluation import EvaluationRun, EvaluationResult  # noqa: F401

    Base.metadata.create_all(engine)


def get_session():
    with SessionLocal() as session:
        yield session
