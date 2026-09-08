from typing import Annotated

from fastapi import APIRouter, File, Form, UploadFile
from fastapi.responses import JSONResponse

from app.schemas.dataset import CSVUploadMetadata, SelectedXLSXUploadMetadata, XLSXUploadMetadata
from app.services.dataset_service import InvalidUpload, inspect_upload
from app.schemas.mapping import MappingConfiguration
from app.services.mapping_service import normalize_dataset
from pydantic import ValidationError
from starlette.concurrency import run_in_threadpool

router = APIRouter(prefix="/datasets", tags=["datasets"])


@router.post("/upload", response_model=CSVUploadMetadata | SelectedXLSXUploadMetadata | XLSXUploadMetadata)
async def upload_dataset(
    file: Annotated[UploadFile, File()],
    sheet_name: Annotated[str | None, Form()] = None,
):
    try:
        return await inspect_upload(file, sheet_name=sheet_name)
    except InvalidUpload as error:
        return JSONResponse(status_code=error.status_code, content={"detail": str(error), "code": error.code})
    finally:
        await file.close()


@router.post('/import')
async def import_dataset(file: Annotated[UploadFile, File()], mapping: Annotated[str, Form()], sheet_name: Annotated[str | None, Form()] = None):
    try:
        configuration = MappingConfiguration.model_validate_json(mapping)
        metadata = await inspect_upload(file, sheet_name)
        if metadata.extension == '.xlsx' and sheet_name is None:
            raise InvalidUpload('Select a worksheet before importing', 'invalid_mapping')
        return await run_in_threadpool(normalize_dataset, file.file, metadata.extension, sheet_name, metadata.columns, configuration)
    except ValidationError:
        return JSONResponse(status_code=400, content={'code': 'invalid_mapping', 'detail': 'Invalid mapping configuration'})
    except InvalidUpload as error:
        return JSONResponse(status_code=400, content={'code': error.code, 'detail': str(error)})
    finally:
        await file.close()
