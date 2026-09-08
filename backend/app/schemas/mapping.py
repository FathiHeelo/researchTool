from typing import Literal
from pydantic import BaseModel, Field


class ColumnAssignment(BaseModel):
    index: int = Field(ge=0)
    role: Literal['case_id', 'requirement', 'expected_rule', 'model', 'metadata', 'ignored']
    label: str | None = None


class MappingConfiguration(BaseModel):
    assignments: list[ColumnAssignment]
