from typing import Literal
from pydantic import BaseModel, ConfigDict, Field


class ColumnAssignment(BaseModel):
    index: int = Field(ge=0)
    role: Literal['case_id', 'requirement', 'expected_rule', 'model', 'metadata', 'ignored']
    label: str | None = None


class ConstantMetadata(BaseModel):
    model_config = ConfigDict(extra='forbid', str_strip_whitespace=True)

    key: str = Field(min_length=1, max_length=200)
    value: str = Field(max_length=1000)


class MappingConfiguration(BaseModel):
    assignments: list[ColumnAssignment]
    constant_metadata: list[ConstantMetadata] = Field(default_factory=list)
