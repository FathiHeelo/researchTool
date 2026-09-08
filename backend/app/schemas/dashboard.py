from pydantic import BaseModel


class ModelDashboardSummary(BaseModel):
    model: str
    response_count: int
    average_overall_accuracy: float | None
    average_component_scores: dict[str, float]
    reliability: float
    hallucination_rate: float


class DashboardSummary(BaseModel):
    include_ground_truth_warnings: bool = True
    filtered_results: int = 0
    filtered_cases: int = 0
    total_runs: int
    total_evaluated_responses: int
    total_unique_cases: int
    total_models: int
    average_overall_accuracy: float | None
    reliability: float
    hallucination_count: int
    hallucination_rate: float
    perfect_results: int
    partial_results: int
    failed_results: int
    error_tag_counts: dict[str, int]
    most_common_error_tags: list[dict[str, int | str]]
    ground_truth_warning_results: int
    ground_truth_warning_cases: int
    models: list[ModelDashboardSummary]
