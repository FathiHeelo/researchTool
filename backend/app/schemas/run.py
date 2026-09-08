from typing import Any, Literal
from pydantic import BaseModel, Field, model_validator


class ImportedBenchmark(BaseModel):
    mode: Literal['FULL','CHANGED_ONLY'] = 'FULL'
    baseline_run_id: int | None = Field(default=None, ge=1)
    protocol_id: int | None = Field(default=None, ge=1)
    protocol_version: int | None = Field(default=None, ge=1)
    use_study_default: bool = False
    cases: list[dict[str, Any]] = Field(min_length=1)
    models: list[dict[str, Any]] = Field(min_length=1)
    responses: list[dict[str, Any]] = Field(min_length=1)

    @model_validator(mode='after')
    def references(self):
        if self.mode=='CHANGED_ONLY' and self.baseline_run_id is None:
            raise ValueError('Choose a baseline run for changed-only evaluation')
        if self.mode=='FULL' and self.baseline_run_id is not None:
            raise ValueError('Baseline is only applicable to changed-only evaluation')
        cases = [item.get('id') for item in self.cases]
        models = [item.get('id') for item in self.models]
        if any(not isinstance(key, str) for key in cases + models) or len(set(cases)) != len(cases) or len(set(models)) != len(models):
            raise ValueError('Cases and models require unique string IDs')
        pairs = [(item.get('case_reference'), item.get('model')) for item in self.responses]
        if any(not isinstance(a, str) or not isinstance(b, str) for a, b in pairs):
            raise ValueError('Invalid response references')
        if len(set(pairs)) != len(pairs) or set(pairs) != {(a, b) for a in cases for b in models}:
            raise ValueError('Provide exactly one response for each case and model')
        return self
