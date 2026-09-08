from pydantic import BaseModel
from typing import Literal


class UploadMetadata(BaseModel):
    filename: str
    extension: str
    size: int


class XLSXUploadMetadata(UploadMetadata):
    sheet_names: list[str]
    sheet_count: int


DatasetType = Literal["text", "integer", "decimal", "boolean", "date", "datetime", "unknown"]


class XLSXPreviewRow(BaseModel):
    # One-based data-row position after the header, including skipped blank rows.
    row_index: int
    # Each value aligns positionally with columns, even for duplicate headers.
    values: list[str | int | float | bool | None]


class SelectedXLSXUploadMetadata(XLSXUploadMetadata):
    selected_sheet: str
    total_row_count: int
    column_count: int
    columns: list[str | int | float | bool | None]
    # Positional list aligned with columns, including duplicate and blank names.
    inferred_data_types: list[DatasetType]
    preview_rows: list[XLSXPreviewRow]




class CSVUploadMetadata(UploadMetadata):
    total_row_count: int
    column_count: int
    columns: list[str]
    inferred_data_types: dict[str, DatasetType]
    preview_rows: list[dict[str, str | None]]
