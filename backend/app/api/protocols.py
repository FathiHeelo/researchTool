from typing import Annotated
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select, update
from sqlalchemy.orm import Session
from app.db import get_session
from app.models.project import Project, utc_now
from app.evaluation.protocols import SavedEvaluationProtocol, ProtocolRequest, study_default

router = APIRouter(prefix='/projects/{project_id}/protocols', tags=['protocols'])
DB = Annotated[Session, Depends(get_session)]


def project(session, project_id):
    if session.get(Project, project_id) is None: raise HTTPException(404, 'Project not found')


def protocol(session, project_id, protocol_id):
    project(session, project_id)
    item = session.get(SavedEvaluationProtocol, protocol_id)
    if item is None or item.project_id != project_id: raise HTTPException(404, 'Protocol not found')
    return item


@router.get('/defaults')
def default_protocol(project_id: int, session: DB):
    project(session, project_id)
    return {'name': 'Study Default', 'version': 1, 'configuration': study_default()}


@router.get('')
def list_protocols(project_id: int, session: DB):
    project(session, project_id)
    return session.scalars(select(SavedEvaluationProtocol).where(SavedEvaluationProtocol.project_id == project_id).order_by(SavedEvaluationProtocol.id)).all()


@router.post('', status_code=201)
def create_protocol(project_id: int, data: ProtocolRequest, session: DB):
    project(session, project_id)
    item = SavedEvaluationProtocol(project_id=project_id, name=data.name, description=data.description, configuration=data.configuration.model_dump())
    session.add(item); session.commit(); session.refresh(item)
    return item


@router.get('/{protocol_id}')
def read_protocol(project_id: int, protocol_id: int, session: DB):
    return protocol(session, project_id, protocol_id)


@router.post('/{protocol_id}')
def update_protocol(project_id: int, protocol_id: int, data: ProtocolRequest, session: DB):
    item = protocol(session, project_id, protocol_id)
    if data.expected_version is None: raise HTTPException(400, 'Provide the version being edited')
    changed = session.execute(update(SavedEvaluationProtocol).where(SavedEvaluationProtocol.id == item.id,
        SavedEvaluationProtocol.version == data.expected_version).values(name=data.name, description=data.description,
        configuration=data.configuration.model_dump(), version=data.expected_version+1, updated_at=utc_now()))
    if changed.rowcount != 1:
        session.rollback(); raise HTTPException(409, 'Protocol changed. Reload before saving a new version.')
    session.commit(); session.refresh(item)
    return item


@router.post('/{protocol_id}/duplicate', status_code=201)
def duplicate_protocol(project_id: int, protocol_id: int, session: DB):
    item = protocol(session, project_id, protocol_id)
    return create_protocol(project_id, ProtocolRequest(name=item.name[:190]+' (copy)', description=item.description,
                          configuration=item.configuration), session)


@router.delete('/{protocol_id}', status_code=204)
def delete_protocol(project_id: int, protocol_id: int, session: DB):
    # Historical runs contain copies, not live foreign-key dependencies.
    session.delete(protocol(session, project_id, protocol_id)); session.commit()
