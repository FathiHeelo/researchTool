from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Response
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db import get_session
from app.models.project import Project
from app.schemas.project import ProjectCreate, ProjectResponse

router = APIRouter(prefix="/projects", tags=["projects"])
DatabaseSession = Annotated[Session, Depends(get_session)]


def find_project(project_id: int, session: Session) -> Project:
    project = session.get(Project, project_id)
    if project is None:
        raise HTTPException(status_code=404, detail="Project not found")
    return project


@router.post("", response_model=ProjectResponse, status_code=201)
def create_project(data: ProjectCreate, session: DatabaseSession):
    project = Project(**data.model_dump())
    session.add(project)
    session.commit()
    session.refresh(project)
    return project


@router.get("", response_model=list[ProjectResponse])
def list_projects(session: DatabaseSession):
    return session.scalars(select(Project).order_by(Project.created_at.desc(), Project.id.desc())).all()


@router.get("/{project_id}", response_model=ProjectResponse)
def get_project(project_id: int, session: DatabaseSession):
    return find_project(project_id, session)


@router.delete("/{project_id}", status_code=204)
def delete_project(project_id: int, session: DatabaseSession):
    session.delete(find_project(project_id, session))
    session.commit()
    return Response(status_code=204)
