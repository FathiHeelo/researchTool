import csv
import hashlib
import io
import json
import zipfile

import pytest
from openpyxl import load_workbook
from scipy.stats import wilcoxon, binomtest

from app import db
from app.evaluation.incremental import EVALUATOR_VERSION
from app.evaluation.metrics import defaults, overall
from app.models.evaluation import EvaluationResult, EvaluationRun, GroundTruthValidation, ReviewDecision
from app.models.project import Project
from test_runs import benchmark, client


BASE = "/projects/1/runs"
STRATEGY_KEY = "Prompt Strategy"
DIMENSION_KEY = "DQ Dimension"


def metric_config(weights=None, disabled=()):
    items = defaults()
    for item in items:
        if weights and item["key"] in weights:
            item["weight"] = weights[item["key"]]
        if item["key"] in disabled:
            item["enabled"] = False
    return items


def scores_for(overall_target, execution=1, semantic=None):
    if semantic is not None:
        return {"syntax": 1, "execution": execution, "semantic": semantic, "completeness": 1}
    remaining = overall_target / 25 - execution
    syntax = max(0, min(1, remaining))
    remaining -= syntax
    semantic = max(0, min(1, remaining))
    remaining -= semantic
    completeness = max(0, min(1, remaining))
    return {"syntax": syntax, "execution": execution, "semantic": semantic, "completeness": completeness}


def validation_run():
    return {
        "models": ["Model Alpha", "Model Beta", "Model Gamma"],
        "expected": {
            "total_responses": 18,
            "total_cases": 9,
            "model_accuracy": {"Model Alpha": 78.125, "Model Beta": 62.5, "Model Gamma": 50.0},
            "global_reliability": 17 / 18 * 100,
            "global_hallucination_rate": 1 / 18 * 100,
            "strategy_delta_alpha": -25.0,
            "strategy_delta_beta": 50.0,
            "dimension_alpha_n": 8,
            "syntax_error_rate": 1 / 18 * 100,
            "unknown_function_rate": 1 / 18 * 100,
            "filtered_response_count": 17,
            "filtered_case_count": 1,
            "stat_alpha": [100, 100, 75, 75, 50, 50],
            "stat_beta": [75, 50, 50, 50, 25, 100],
        },
    }


def add_result(session, run, case_id, model, scores, strategy, dimension, generated=None,
               hallucination=False, errors=None, warning=False, requirement="Requirement", expected_rule='expect_column_to_exist("a")'):
    generated = generated if generated is not None else expected_rule
    result = EvaluationResult(
        run_id=run.id,
        snapshot={
            "case": {
                "id": f"{case_id}-{strategy}-{dimension}",
                "case_id": case_id,
                "requirement": requirement,
                "expected_rule": expected_rule,
                "original_row_number": len(session.new) + 2,
                "metadata": [
                    {"label": STRATEGY_KEY, "value": strategy},
                    {"label": DIMENSION_KEY, "value": dimension},
                    {"label": "Arabic محور", "value": "بحث"},
                ],
            },
            "model": {"id": model.lower().replace(" ", "-"), "label": model},
            "response": {"source_column_name": model, "generated_output": generated},
        },
        model=model,
        case_id=case_id,
        requirement=requirement,
        scores=scores,
        overall_accuracy=overall(scores, run.summary["metric_configuration"]),
        hallucination_detected=hallucination,
        hallucinated_functions=["expect_invented"] if hallucination else [],
        error_tags=errors or [],
        notes=["fixture"],
        evaluation={"errors": [{"code": tag} for tag in (errors or [])], "provenance": {"evaluation_origin": "evaluated", "evaluator_version": EVALUATOR_VERSION}},
    )
    session.add(result)
    session.flush()
    session.add(GroundTruthValidation(result_id=result.id, warnings=[{"warning_type": "UNKNOWN_EXPECTATION", "severity": "warning", "message": "Fixture warning"}] if warning else []))
    return result


def create_release_fixture(client):
    with db.SessionLocal() as session:
        run = EvaluationRun(
            project_id=1,
            status="completed",
            total_responses=18,
            processed_responses=18,
            summary={
                "metric_configuration": metric_config(),
                "evaluator_version": EVALUATOR_VERSION,
                "equivalence_version": "1",
                "gx_version": "fixture",
                "protocol_id": None,
                "protocol_version": 1,
                "protocol_snapshot": {
                    "protocol_id": None,
                    "protocol_version": 1,
                    "name": "Release validation",
                    "configuration": {
                        "metrics": metric_config(),
                        "analysis_metadata_keys": {"strategy": STRATEGY_KEY, "dimension": DIMENSION_KEY},
                        "statistics": {"enabled": True, "alpha": 0.05, "correction": "holm"},
                    },
                },
            },
        )
        session.add(run)
        session.commit()
        session.refresh(run)

        add_result(session, run, "Matched", "Model Alpha", scores_for(100), "Strategy A", "Completeness")
        override_target = add_result(session, run, "Matched", "Model Alpha", scores_for(87.5, semantic=.5), "Strategy B", "Completeness")
        add_result(session, run, "Matched", "Model Beta", scores_for(50), "Strategy A", "Accuracy")
        add_result(session, run, "Matched", "Model Beta", scores_for(100), "Strategy B", "Accuracy")
        add_result(session, run, "Gamma-1", "Model Gamma", {"syntax": 1, "execution": 0, "semantic": 0, "completeness": .5}, "Strategy A", "Validity",
                   generated='expect_invented("a")', hallucination=True, errors=["UNKNOWN_FUNCTION", "SYNTAX_RECOVERY"])
        add_result(session, run, "Gamma-2", "Model Gamma", scores_for(62.5), "Strategy B", "Validity", warning=True, expected_rule="expect_fixture_unknown()")

        alpha_values = validation_run()["expected"]["stat_alpha"]
        beta_values = validation_run()["expected"]["stat_beta"]
        for index, (alpha, beta) in enumerate(zip(alpha_values, beta_values), 1):
            add_result(session, run, f"Stat-{index}", "Model Alpha", scores_for(alpha), "Strategy A", "Accuracy")
            add_result(session, run, f"Stat-{index}", "Model Beta", scores_for(beta), "Strategy A", "Accuracy")

        previous = {"override_scores": {}, "review_note": "", "error_tags": override_target.error_tags}
        new = {"override_scores": {"semantic": 0}, "review_note": "Accepted release fixture override", "error_tags": override_target.error_tags}
        session.add(ReviewDecision(result_id=override_target.id, actor="release-validator", reason="Hand calculation fixture", previous_value=previous, new_value=new))
        run.summary = {**run.summary, "total_evaluated": 18, "successful_evaluations": 18, "execution_failures": 1,
                       "hallucinations": 1, "average_overall_accuracy": 1250 / 18}
        session.commit()
        return run.id, override_target.id


def test_hand_calculated_formulas_filters_overrides_and_statistics(client):
    run_id, reviewed_id = create_release_fixture(client)
    expected = validation_run()["expected"]

    assert overall({"syntax": 1, "execution": 1, "semantic": .5, "completeness": 1}, metric_config()) == 87.5
    assert overall({"syntax": 1, "execution": 1, "semantic": .5, "completeness": 1}, metric_config({"syntax": 4, "execution": 2, "semantic": 1, "completeness": 1})) == 93.75
    assert overall({"syntax": 1, "execution": 1, "semantic": 0, "completeness": 0}, metric_config(disabled=("syntax", "execution"))) == 0

    review = client.get(f"{BASE}/{run_id}/results/{reviewed_id}/review").json()
    assert review["automated_scores"]["semantic"] == .5
    assert review["accepted_scores"]["semantic"] == 0
    assert review["accepted_overall_accuracy"] == 75
    assert review["audit_history"][0]["reason"] == "Hand calculation fixture"

    dashboard = client.get(f"{BASE}/dashboard/summary?run_id={run_id}").json()
    assert dashboard["total_evaluated_responses"] == expected["total_responses"]
    assert dashboard["total_unique_cases"] == expected["total_cases"]
    assert dashboard["total_models"] == 3
    assert dashboard["reliability"] == pytest.approx(expected["global_reliability"], abs=.01)
    assert dashboard["hallucination_rate"] == pytest.approx(expected["global_hallucination_rate"], abs=.01)
    assert dashboard["error_tag_counts"] == {"SYNTAX_RECOVERY": 1, "UNKNOWN_FUNCTION": 1}
    by_model = {item["model"]: item for item in dashboard["models"]}
    assert by_model["Model Alpha"]["average_overall_accuracy"] == expected["model_accuracy"]["Model Alpha"]
    assert by_model["Model Beta"]["average_overall_accuracy"] == expected["model_accuracy"]["Model Beta"]
    assert by_model["Model Gamma"]["average_overall_accuracy"] == expected["model_accuracy"]["Model Gamma"]

    analytics = client.get(f"{BASE}/dashboard/research?run_id={run_id}&strategy_key=Prompt%20Strategy&dimension_key=DQ%20Dimension").json()
    assert analytics["response_count"] == expected["total_responses"]
    deltas = {(item["model"], item["strategy_a"], item["strategy_b"]): item for item in analytics["strategy_deltas"]}
    assert deltas[("Model Alpha", "Strategy A", "Strategy B")]["delta"] == expected["strategy_delta_alpha"]
    assert deltas[("Model Beta", "Strategy A", "Strategy B")]["delta"] == expected["strategy_delta_beta"]
    dimensions = {(item["model"], item["value"]): item for item in analytics["dimensions"]}
    assert dimensions[("Model Alpha", "Accuracy")]["response_count"] == expected["dimension_alpha_n"] - 2
    assert dimensions[("Model Alpha", "Completeness")]["response_count"] == 2
    errors = {item["tag"]: item for item in analytics["errors"]}
    assert errors["SYNTAX_RECOVERY"]["percentage"] == pytest.approx(expected["syntax_error_rate"])
    assert errors["UNKNOWN_FUNCTION"]["percentage"] == pytest.approx(expected["unknown_function_rate"])
    assert analytics["agreement"][0]["comparable_count"] == 7
    assert analytics["ground_truth_summary"]["warning_count"] == 1

    filtered = client.get(f"{BASE}/dashboard/research?run_id={run_id}&include_ground_truth_warnings=false&strategy_key=Prompt%20Strategy&dimension_key=DQ%20Dimension").json()
    assert filtered["response_count"] == expected["filtered_response_count"]
    assert filtered["filtered_cases"] == expected["filtered_case_count"]
    assert filtered["ground_truth_warning_results"] == 0

    stats = client.get(f"{BASE}/dashboard/statistics?run_id={run_id}&groups=Model%20Alpha&groups=Model%20Beta&enabled=true").json()
    comparison = stats["comparisons"][0]
    scipy_result = wilcoxon([b - a for a, b in zip(expected["stat_alpha"], expected["stat_beta"])], zero_method="wilcox", alternative="two-sided", method="auto")
    assert comparison["matched_n"] == 6
    assert comparison["final_matched_count"] == 6
    assert comparison["statistic"] == pytest.approx(float(scipy_result.statistic))
    assert comparison["raw_p_value"] == pytest.approx(float(scipy_result.pvalue))
    assert comparison["adjusted_p_value"] == comparison["raw_p_value"]

    reliability_stats = client.get(f"{BASE}/dashboard/statistics?run_id={run_id}&groups=Model%20Alpha&groups=Model%20Beta&metric=execution&enabled=true").json()["comparisons"][0]
    assert reliability_stats["discordant_a0_b1"] == 0
    assert reliability_stats["discordant_a1_b0"] == 0
    assert reliability_stats["status"] == "insufficient_data"
    assert binomtest(0, 1, .5).pvalue == 1


def test_dashboard_export_summary_and_replication_consistency(client):
    run_id, reviewed_id = create_release_fixture(client)
    query = f"run_id={run_id}&strategy_key=Prompt%20Strategy&dimension_key=DQ%20Dimension"
    analytics = client.get(f"{BASE}/dashboard/research?{query}").json()
    dashboard = client.get(f"{BASE}/dashboard/summary?run_id={run_id}").json()
    summary = client.get(f"{BASE}/dashboard/analyst-summary?{query}").json()

    assert dashboard["models"][0]["average_overall_accuracy"] == analytics["models"][0]["average_overall_accuracy"]
    global_accuracy = next(item for item in summary["overview"] if item["supporting_metric"] == "average_overall_accuracy")
    assert global_accuracy["value"] == analytics["average_overall_accuracy"]
    alpha_finding = next(item for item in summary["model_findings"] if item.get("model") == "Model Alpha" and item["supporting_metric"] == "average_overall_accuracy")
    alpha = next(item for item in analytics["models"] if item["model"] == "Model Alpha")
    assert alpha_finding["value"] == alpha["average_overall_accuracy"]

    csv_response = client.get(f"{BASE}/{run_id}/export?format=csv&strategy_key=Prompt%20Strategy&dimension_key=DQ%20Dimension")
    assert csv_response.status_code == 200
    csv_rows = list(csv.DictReader(io.StringIO(csv_response.content.decode("utf-8-sig"))))
    reviewed_row = next(row for row in csv_rows if int(row["Result ID"]) == reviewed_id)
    assert reviewed_row["Automated: semantic"] == "0.5"
    assert reviewed_row["Override: semantic"] == "0"
    assert reviewed_row["Accepted: semantic"] == "0"
    assert reviewed_row["Accepted Overall Accuracy"] == "75.0"

    book = load_workbook(io.BytesIO(client.get(f"{BASE}/{run_id}/export?strategy_key=Prompt%20Strategy&dimension_key=DQ%20Dimension").content))
    model_sheet = book["Model Summary"]
    headers = [cell.value for cell in model_sheet[1]]
    model_rows = {row[headers.index("model")]: row for row in model_sheet.iter_rows(min_row=2, values_only=True)}
    assert model_rows["Model Alpha"][headers.index("average_overall_accuracy")] == alpha["average_overall_accuracy"]
    config_sheet = book["Metric Configuration"]
    assert [row[0] for row in config_sheet.iter_rows(min_row=2, max_col=1, values_only=True)] == ["syntax", "execution", "semantic", "completeness"]

    package = client.get(f"/projects/1/runs/{run_id}/replication").content
    with zipfile.ZipFile(io.BytesIO(package)) as archive:
        manifest = json.loads(archive.read("replication_package/manifest.json"))
        for item in manifest["files"]:
            content = archive.read(item["path"])
            assert hashlib.sha256(content).hexdigest() == item["sha256"]
        detailed = archive.read("replication_package/data/detailed_results.csv").decode("utf-8-sig")
        assert "Model Alpha" in detailed and "Accepted: semantic" in detailed
        assert json.loads(archive.read("replication_package/configuration/metric_configuration.json")) == defaults()
        assert json.loads(archive.read("replication_package/configuration/evaluator_version.json"))["evaluator_version"] == EVALUATOR_VERSION
        joined = "\n".join(archive.read(name).decode("utf-8", errors="ignore") for name in archive.namelist() if name.endswith((".csv", ".json", ".md")))
        assert "C:\\Users" not in joined and "api_key" not in joined.lower()


def test_incremental_dry_run_reuses_and_reevaluates_only_changed_response(client):
    baseline = client.post(BASE, json=benchmark()).json()
    unchanged = benchmark()
    unchanged.update(mode="CHANGED_ONLY", baseline_run_id=baseline["id"])
    reused = client.post(BASE, json=unchanged).json()
    assert reused["summary"]["reused_count"] == 4
    assert reused["summary"]["reevaluated_count"] == 0
    assert {item["provenance"]["evaluation_origin"] for item in client.get(f"{BASE}/{reused['id']}/results").json()["items"]} == {"reused"}

    changed = benchmark()
    changed["responses"][0]["generated_output"] = 'expect_column_to_exist("b")'
    changed.update(mode="CHANGED_ONLY", baseline_run_id=baseline["id"])
    mixed = client.post(BASE, json=changed).json()
    assert mixed["summary"]["reused_count"] == 3
    assert mixed["summary"]["reevaluated_count"] == 1
    origins = [item["provenance"]["evaluation_origin"] for item in client.get(f"{BASE}/{mixed['id']}/results").json()["items"]]
    assert origins.count("evaluated") == 1 and origins.count("reused") == 3


def test_release_workflow_integrity_and_edge_cases(client):
    run_id, reviewed_id = create_release_fixture(client)
    results = client.get(f"{BASE}/{run_id}/results?page_size=100").json()["items"]
    reviewed = client.get(f"{BASE}/{run_id}/results/{reviewed_id}/review").json()
    assert all(item["requirement"] for item in results)
    assert all(item["snapshot"]["case"]["expected_rule"] is not None for item in results)
    assert all(item["snapshot"]["response"]["generated_output"] is not None for item in results)
    assert any(item["model"] == "Model Gamma" for item in results)
    assert any(item["snapshot"]["case"]["metadata"] for item in results)
    assert reviewed["automated_scores"]["semantic"] == .5
    assert reviewed["override_scores"]["semantic"] == 0
    assert reviewed["accepted_scores"]["semantic"] == 0
    assert reviewed["audit_history"]
    assert reviewed["ground_truth_warnings"] == []

    dashboard = client.get(f"{BASE}/dashboard/summary?run_id={run_id}&model=Model%20Gamma").json()
    assert dashboard["models"][0]["model"] == "Model Gamma"
    assert dashboard["ground_truth_warning_results"] == 1
    assert client.get(f"{BASE}/dashboard/research?run_id={run_id}&model=Model%20Alpha&dimension_key=Missing").json()["dimensions"] == []
    assert client.get(f"{BASE}/dashboard/summary?run_id={run_id}&metadata_key=Missing").json()["total_evaluated_responses"] == 0

    with db.SessionLocal() as session:
        project = session.get(Project, 1)
        one_model = EvaluationRun(project_id=project.id, status="completed", total_responses=1, processed_responses=1,
                                  summary={"metric_configuration": defaults(), "evaluator_version": EVALUATOR_VERSION,
                                           "protocol_snapshot": {"protocol_version": 1, "configuration": {"metrics": defaults()}}})
        session.add(one_model)
        session.commit()
        session.refresh(one_model)
        add_result(session, one_model, "Edge", "نموذج مكرر", scores_for(100), "بدون", "بدون", requirement="x" * 3000)
        session.commit()
        edge_id = one_model.id
    edge = client.get(f"{BASE}/dashboard/research?run_id={edge_id}").json()
    assert edge["total_models"] == 1
    assert edge["hallucination_rate"] == 0
    assert edge["errors"] == []
    assert client.get(f"{BASE}/dashboard/statistics?run_id={edge_id}").json()["status"] == "insufficient_data"
