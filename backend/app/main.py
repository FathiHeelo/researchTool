from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.api.projects import router as projects_router
from app.api.datasets import router as datasets_router
from app.db import init_db
from app.api.runs import router as runs_router
from app.api.protocols import router as protocols_router
from app.api.reproducibility import router as reproducibility_router


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    yield


app = FastAPI(title=settings.app_name, lifespan=lifespan)
app.include_router(projects_router)
app.include_router(datasets_router)
app.include_router(runs_router)
app.include_router(protocols_router)
app.include_router(reproducibility_router)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_methods=["GET", "POST", "DELETE"],
    allow_headers=["*"],
)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}
