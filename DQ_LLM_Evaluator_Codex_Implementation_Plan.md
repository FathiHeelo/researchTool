# DQ-LLM Evaluator — Codex Implementation Plan

## 0. Purpose of This File

This document is the implementation roadmap for Codex. Build the project incrementally, phase by phase, and do not jump ahead. Each work item has a clear scope, backend tasks, frontend tasks, tests, and a Definition of Done.

The product is a **research and analysis assistant for evaluating LLM-generated Great Expectations rules**. It must support **any number of models**, not only ChatGPT. The tool receives an Excel/CSV benchmark sheet containing a requirement, an expected answer, and outputs from multiple LLMs such as ChatGPT, Gemini, Grok, Claude, Kimi, DeepSeek, or any future model.

The application evaluates model outputs using configurable research metrics, explains errors, supports researcher review/override, compares models, and exports research-ready results.

---

# 1. Product Goal

Build a local-first web application that allows a researcher to:

1. Upload a benchmark Excel or CSV file.
2. Map columns such as:
   - Case ID
   - Requirement
   - Expected Output
   - One or more model output columns
3. Detect model columns dynamically rather than hard-coding model names.
4. Configure evaluation metrics and weights.
5. Evaluate every model response for every benchmark row.
6. Produce deterministic evaluation wherever possible.
7. Detect syntax, Great Expectations function usage, parameter differences, boundary mistakes, type mismatches, regex differences, missing conditions, extra conditions, and unsupported expectations.
8. Allow human researcher review and manual override.
9. Generate notes explaining why a score was assigned.
10. Produce dashboards comparing all models.
11. Export row-level and summary-level results back to Excel/CSV.
12. Preserve an audit trail of automated score vs researcher-adjusted score.

The tool should behave as both:

- **Evaluator** — scores generated rules.
- **Research Analyst** — explains error patterns and compares model behavior.

---

# 2. MVP Scope vs Later Scope

## MVP target

The first usable version should be achievable in approximately **10 focused development hours** with Codex assistance.

The MVP must include:

- Excel/CSV upload
- Dynamic model column selection
- Syntax analysis
- Rule parsing with Python AST
- Core semantic comparison rules
- Completeness checking
- Great Expectations execution/availability checking where safely possible
- Configurable metrics and weights
- Row-level results table
- Model summary table
- Manual score override + note
- Excel export

## Not required in the first MVP

Do not block the MVP on:

- User authentication
- Cloud multi-user collaboration
- Paid accounts
- External LLM APIs
- Complex AI agents
- PostgreSQL deployment
- Distributed workers
- Large-scale queues

These can be added later.

---

# 3. Recommended Technology Stack

## Backend

- **Python 3.12+**
- **FastAPI** — API layer
- **Pydantic** — request/response schemas
- **Pandas** — benchmark data processing
- **OpenPyXL** — Excel reading/writing and formatted export
- **Python AST** — parse generated Python expectation calls structurally
- **Great Expectations** — validate supported expectation names/signatures and optionally execute rules against test fixtures
- **re / regex utilities** — compare regular expressions
- **SQLite + SQLAlchemy** — local persistence for projects, runs, overrides, and configuration
- **Pytest** — backend tests

## Frontend

- **React + TypeScript**
- **Vite**
- **Tailwind CSS** for a clean neutral research UI
- **TanStack Query** for API state
- **TanStack Table** for large result tables
- **Recharts** for charts
- **React Hook Form + Zod** for configuration forms

## Optional later integrations

- PostgreSQL
- Docker
- OpenAI / Gemini / Anthropic API as optional semantic judge fallback
- Background worker for very large benchmark runs

---

# 4. High-Level Architecture

```text
Excel / CSV Benchmark
        |
        v
File Ingestion Layer
        |
        v
Column Mapping + Validation
        |
        v
Case Normalizer
        |
        +----------------------+
        |                      |
        v                      v
Expected Rule Parser      Model Output Parser
        |                      |
        +----------+-----------+
                   |
                   v
            Evaluation Engine
                   |
     +-------------+-------------+----------------+
     |             |             |                |
     v             v             v                v
 Syntax       Execution      Semantic       Completeness
     |             |             |                |
     +-------------+-------------+----------------+
                   |
                   v
            Scoring Engine
                   |
                   v
            Research Review
          Manual Override Layer
                   |
                   v
         Dashboard + Error Analysis
                   |
                   v
             Excel Export
```

---

# 5. Core Research Metrics

The metrics system must be configurable. Do not hard-code the entire application around only four metrics.

## Default metrics

### 5.1 Syntax Correctness

Question:

> Is the generated rule valid Python / Great Expectations call syntax?

Default scale:

- `1` = correct
- `0` = incorrect

Checks include:

- Python parsing succeeds
- Function call structure is valid
- Required commas/parentheses/quotes are valid

---

### 5.2 Execution Success

Question:

> Can the rule run without a runtime/configuration error in the supported Great Expectations environment?

Default scale:

- `1` = executes / recognized and callable
- `0` = fails

Possible failure reasons:

- Unknown expectation
- Invalid argument name
- Missing required argument
- Unsupported contrib/custom expectation
- Invalid parameter type

The evaluator must store an execution error message when available.

---

### 5.3 Semantic Correctness

Question:

> Does the generated rule mean the same thing as the requirement / expected rule?

Default scale:

- `1` = correct/equivalent
- `0.5` = partially correct
- `0` = wrong

Examples:

Equivalent:

```text
int ~= integer
text ~= str
max_value=None ~= max_value omitted
min_value=None ~= min_value omitted
```

Not equivalent:

```text
min_value=0 != min_value=0 + strict_min=True
>= 0 != > 0
float != decimal when exact type matters
5-digit ZIP != ZIP or ZIP+4
http/https != http/https/ftp
```

---

### 5.4 Completeness

Question:

> Are all required conditions represented?

Default scale:

- `1` = complete
- `0.5` = partial
- `0` = incomplete

Examples of missing conditions:

- Missing `expect_column_to_exist`
- Missing type requirement
- Missing not-null requirement
- Missing uniqueness requirement
- Missing range requirement
- Missing regex requirement

---

# 6. Optional Additional Metrics

The researcher should be able to enable or disable these later:

- Function Correctness
- Parameter Correctness
- Type Correctness
- Boundary Correctness
- Regex Correctness
- Column/Table Name Preservation
- Minimality
- Output Format Compliance
- Unsupported/Invented Function Rate
- Extra Constraint Penalty

Each metric needs:

- ID
- Name
- Description
- Enabled flag
- Allowed scores
- Weight
- Calculation method

---

# 7. Scoring Model

Default final score:

```text
Final Score = sum(metric_normalized_score * metric_weight)
```

For the original 4 metrics with equal weights:

```text
Syntax         25%
Execution      25%
Semantic       25%
Completeness   25%
```

Example:

```text
Syntax       = 1
Execution    = 1
Semantic     = 0.5
Completeness = 1

Final = 87.5%
```

The application must preserve:

- automated score
- researcher-adjusted score
- final accepted score

---

# 8. Input File Design

The system must not assume fixed model names.

Typical input:

| ID | Requirement | Expected | ChatGPT | Gemini | Grok | Claude | Kimi | DeepSeek |
|---|---|---|---|---|---|---|---|---|

But the user must be able to map columns manually.

## Required mappings

- Requirement column
- Expected output column
- At least one model output column

## Optional mappings

- Case ID
- Dataset/category
- Prompt version
- Requirement type
- Notes
- Ground-truth status

## Import behavior

After upload, show:

- file name
- sheet names
- row count
- column count
- detected likely mappings
- sample preview

Allow the user to change all mappings before evaluation.

---

# 9. Rule Parsing Engine

Never rely only on raw text comparison.

Use Python AST to convert each function call into a canonical representation.

Example input:

```python
expect_column_values_to_be_between(
    column="tax_rate",
    min_value=0.0,
    max_value=1.0
)
```

Canonical form:

```json
{
  "function": "expect_column_values_to_be_between",
  "args": [],
  "kwargs": {
    "column": "tax_rate",
    "min_value": 0.0,
    "max_value": 1.0
  }
}
```

Support multiple calls in one response.

Store:

- parsed calls
- parse errors
- line number if possible
- original source text
- normalized source text

---

# 10. Equivalence Rules Engine

Create a dedicated module for research-defined equivalence rules.

Do not scatter equivalence logic across components.

## Initial equivalence rules

### Type aliases

```text
text ~= str
int ~= integer
```

Do not automatically treat these as equivalent unless explicitly configured:

```text
float vs decimal
int vs decimal
```

### Optional None parameters

These are equivalent when the GX function treats omitted values as None:

```text
max_value=None ~= omitted max_value
min_value=None ~= omitted min_value
```

### Redundant string length lower bound

For string length:

```text
min_value=0 ~= omitted min_value
```

because a string length cannot be negative.

### Boundary strictness

```text
min_value=0 != min_value=0, strict_min=True
max_value=5 != max_value=5, strict_max=True
```

### Functionally equivalent formulations

Example:

```text
expect_column_values_to_be_greater_than(value=0)
~=
expect_column_values_to_be_between(min_value=0, strict_min=True)
```

when both represent `> 0`.

### Positional vs keyword arguments

Equivalent when they bind to the same function parameter:

```text
expect_column_to_exist("id")
~=
expect_column_to_exist(column="id")
```

### Quote style

Equivalent:

```text
"order_id" ~= 'order_id'
```

### Rule ordering

Order of independent expectation calls should not affect the score.

---

# 11. Regex Analysis

Regex evaluation must be handled separately from plain string equality.

The initial version should support three levels:

1. Exact normalized regex match
2. Known equivalent regex forms
3. Different behavior / partial semantic overlap

Examples:

```text
r"^[A-Z]{3}$"
"^[A-Z]{3}$"
```

Equivalent.

But:

```text
^(https?|ftp)://...
vs
^https?://...
```

Partial because FTP support is missing.

For complex regexes, store a reason such as:

- missing alternative
- broader than expected
- stricter than expected
- literal dot vs wildcard dot
- anchor mismatch

Do not attempt to formally prove arbitrary regex equivalence in the MVP.

---

# 12. Great Expectations Function Registry

Create a registry/service that can determine:

- Is the function recognized?
- Is it a core expectation?
- Is it contrib/custom/environment-dependent?
- What arguments are expected?
- Which required arguments are missing?

This service powers Execution Success and error explanations.

Unknown or environment-dependent expectations should not silently receive full execution credit.

---

# 13. Expected Output Validation

Before evaluating models, validate the expected/ground-truth rule itself.

For each benchmark row calculate:

- Expected syntax valid?
- Expected GX function recognized?
- Expected arguments valid?
- Suspicious semantics?

Possible status:

```text
VALID
WARNING
INVALID
```

Examples of suspicious expected output:

- table-level expectation with a column parameter
- wrong GX parameter name
- value_set containing only the literal column name when cross-table comparison appears intended

The tool must not automatically rewrite ground truth. It should only flag it for researcher review.

---

# 14. Error Taxonomy

Every failed or partial case should receive zero or more error tags.

Initial taxonomy:

```text
SYNTAX_ERROR
UNKNOWN_EXPECTATION
INVALID_PARAMETER
MISSING_CONDITION
EXTRA_CONDITION
TYPE_MISMATCH
BOUNDARY_MISMATCH
REGEX_TOO_BROAD
REGEX_TOO_STRICT
REGEX_BEHAVIOR_MISMATCH
COLUMN_NAME_MISMATCH
TABLE_NAME_MISMATCH
CROSS_TABLE_REFERENCE_ERROR
HARDCODED_DYNAMIC_VALUE
DYNAMIC_PARAMETER_ERROR
OUTPUT_FORMAT_VIOLATION
NON_MINIMAL_OUTPUT
GROUND_TRUTH_WARNING
```

These tags are important for research analysis.

---

# 15. Researcher Review / Manual Override

The system must allow a researcher to override any automatically assigned metric score.

For each override store:

- original automated score
- new score
- researcher note
- timestamp
- metric changed

UI behavior:

```text
Semantic Correctness
Auto: 0.5
Researcher: [1.0]
Reason: [Equivalent in our evaluation protocol]
```

Never delete the automated result when overridden.

---

# 16. Backend Data Model

Use SQLite for MVP.

## Project

```text
id
name
created_at
updated_at
```

## DatasetImport

```text
id
project_id
filename
sheet_name
row_count
column_mapping_json
created_at
```

## BenchmarkCase

```text
id
project_id
external_case_id
requirement
expected_output
metadata_json
```

## Model

```text
id
project_id
name
source_column
```

## ModelResponse

```text
id
case_id
model_id
raw_output
```

## EvaluationRun

```text
id
project_id
status
metric_config_json
started_at
completed_at
```

## EvaluationResult

```text
id
run_id
case_id
model_id
syntax_score
execution_score
semantic_score
completeness_score
automated_final_score
accepted_final_score
note
error_tags_json
execution_error
```

## MetricOverride

```text
id
result_id
metric_key
old_score
new_score
reason
created_at
```

---

# 17. Backend API Surface

Use `/api/v1`.

## Projects

```text
POST   /projects
GET    /projects
GET    /projects/{id}
DELETE /projects/{id}
```

## Imports

```text
POST /projects/{id}/imports/preview
POST /projects/{id}/imports/confirm
GET  /projects/{id}/cases
```

## Metrics

```text
GET  /metrics/defaults
GET  /projects/{id}/metrics
PUT  /projects/{id}/metrics
```

## Evaluation

```text
POST /projects/{id}/runs
GET  /runs/{run_id}
GET  /runs/{run_id}/results
GET  /runs/{run_id}/summary
```

## Overrides

```text
POST /results/{result_id}/overrides
GET  /results/{result_id}/overrides
```

## Export

```text
GET /runs/{run_id}/export.xlsx
GET /runs/{run_id}/export.csv
```

---

# 18. Frontend Pages

## 18.1 Home / Projects

Features:

- New Project
- Existing projects
- Last run status
- Dataset size
- Number of models

Keep the design clean and research-focused.

---

## 18.2 Import Dataset

Steps:

1. Upload file
2. Select sheet if `.xlsx`
3. Preview rows
4. Map columns
5. Select model columns
6. Confirm import

Model columns must be dynamic.

---

## 18.3 Metrics Configuration

Display each metric with:

- enabled toggle
- description
- scale
- weight

Show total weight validation.

Example:

```text
Syntax Correctness       [ON]  25%
Execution Success        [ON]  25%
Semantic Correctness     [ON]  25%
Completeness             [ON]  25%
```

---

## 18.4 Run Evaluation

Show:

- total cases
- models
- total evaluations = cases × models
- start evaluation button
- progress
- status
- failures

---

## 18.5 Results Explorer

Main research table:

| Case | Model | Syntax | Execution | Semantic | Completeness | Final | Status |

Features:

- filters
- model filter
- metric filter
- score range
- error tag filter
- search case/field name
- open detailed review

---

## 18.6 Case Review

Show side-by-side:

### Requirement

### Expected Output

### Model Output

### Parsed Expected

### Parsed Model Output

### Metric Scores

### Error Tags

### Generated Note

### Manual Override

This is the main researcher review screen.

---

## 18.7 Model Comparison Dashboard

Show:

- final average score by model
- metric average by model
- perfect cases
- partial cases
- failed cases
- unsupported function count
- most common error types

Charts:

- bar chart: final score by model
- grouped bar: metric score by model
- error frequency chart
- perfect/partial/failed distribution

---

## 18.8 Export Screen

Export options:

- Full Results Excel
- Summary Excel
- CSV

Excel workbook should contain sheets:

```text
Original_Data
Detailed_Results
Model_Summary
Metric_Summary
Error_Analysis
Ground_Truth_Warnings
Overrides
Run_Config
```

---

# 19. Automated Notes Generator

Notes must be deterministic in MVP.

Examples:

```text
The generated output is functionally equivalent to the expected output.
```

```text
The range condition is correct, but float is not exactly the same type requirement as decimal.
```

```text
strict_min=True changes the requirement from >= 0 to > 0.
```

```text
The generated regex only supports HTTP/HTTPS while the expected regex also accepts FTP.
```

```text
The rule expresses the intended cross-table relationship, but the expectation is not available in the supported environment.
```

Store note templates in one module/config file.

---

# 20. Codex Work Plan

Codex must implement work items in order.

---

## Work Item 01 — Repository Foundation

### Backend

- Create `backend/`
- Initialize FastAPI
- Add settings/config
- Add health endpoint
- Configure CORS for local frontend
- Add pytest

### Frontend

- Create `frontend/` using React + TypeScript + Vite
- Add Tailwind
- Add router
- Add API client
- Create neutral app shell

### Root

- README
- `.gitignore`
- `.env.example`
- development commands

### Definition of Done

- Backend starts successfully
- Frontend starts successfully
- Frontend can call `/health`
- Tests pass

---

## Work Item 02 — Project Persistence

### Backend

- Add SQLite + SQLAlchemy
- Create Project entity
- Create migrations/simple DB bootstrap
- Implement Project CRUD API

### Frontend

- Project list page
- Create project modal/form
- Open project

### Tests

- create project
- list projects
- get project
- delete project

### Definition of Done

User can create and open a research project.

---

## Work Item 03 — File Upload and Dataset Preview

### Backend

- Accept `.xlsx`, `.xls` if supported, and `.csv`
- Read Excel via Pandas/OpenPyXL
- Return sheet names
- Preview first N rows
- Return columns and inferred data types
- Validate empty files and malformed files

### Frontend

- Drag/drop upload
- Sheet selector
- Preview table
- File metadata

### Definition of Done

Researcher can upload a benchmark sheet and preview its content without importing yet.

---

## Work Item 04 — Column Mapping and Dynamic Model Detection

### Backend

- Schema for column mapping
- Save mapping
- Import benchmark cases
- Create model records dynamically from selected columns
- Preserve original row metadata

### Frontend

Mapping UI for:

- Case ID
- Requirement
- Expected Output
- Model output columns (multi-select)
- Optional metadata

### Definition of Done

The application supports any number of model columns without code changes.

---

## Work Item 05 — Python AST Rule Parser

### Backend only

Create `evaluation/parser.py`.

Responsibilities:

- Parse one or multiple expectation calls
- Extract function name
- Extract positional args
- Extract kwargs
- Normalize literals
- Record syntax errors
- Preserve original text

### Tests

Include examples for:

- blank lines
- same-line calls
- single vs double quotes
- raw strings
- positional arguments
- multiple calls
- syntax errors

### Definition of Done

Expected and model outputs can be represented as structured calls rather than raw strings.

---

## Work Item 06 — Canonicalization and Equivalence Engine

### Backend

Create:

```text
evaluation/canonicalizer.py
evaluation/equivalence.py
```

Implement initial rules:

- str/text
- int/integer
- None omitted
- redundant string min length 0
- positional vs keyword argument
- order independence
- strict boundary behavior
- greater-than vs between+strict equivalence

### Tests

Each equivalence rule must have positive and negative tests.

### Definition of Done

Known cosmetic/formulation differences no longer reduce semantic score.

---

## Work Item 07 — Default Four-Metric Evaluator

### Backend

Implement:

- Syntax Correctness
- Execution Success
- Semantic Correctness
- Completeness

Return structured output:

```json
{
  "syntax": 1,
  "execution": 1,
  "semantic": 0.5,
  "completeness": 1,
  "final_score": 87.5,
  "errors": [],
  "note": "..."
}
```

### Definition of Done

Single expected/model pair can be evaluated end-to-end.

---

## Work Item 08 — Great Expectations Registry and Execution Validation

### Backend

- Detect known expectation functions
- Validate argument names
- Detect missing required parameters
- Distinguish core vs unsupported/custom/environment-dependent rules
- Store execution failure reason

Do not execute arbitrary unsafe Python from uploaded sheets.

Use parsed/controlled invocation only.

### Definition of Done

Execution Success is based on actual supported behavior, not only guessed from function names.

---

## Work Item 09 — Regex Comparator

### Backend

Create specialized regex comparison service.

Support:

- exact normalized match
- raw string vs normal string equivalence
- escaped backslash normalization
- obvious scheme alternatives
- anchor mismatch
- wildcard dot vs literal dot
- broader/stricter classification where deterministically detectable

### Definition of Done

Common regex differences seen in the benchmark receive consistent scores and notes.

---

## Work Item 10 — Batch Evaluation Runs

### Backend

- Create EvaluationRun
- Evaluate every case × every model
- Persist results
- Track run status
- Handle individual failures without aborting full run

### Frontend

- Run evaluation page
- Progress display
- Run summary

### Definition of Done

A complete uploaded benchmark can be evaluated in one action.

---

## Work Item 11 — Results Explorer

### Backend

- Paginated results endpoint
- Filtering by model, metric, score, error tag

### Frontend

- TanStack table
- Filters
- Sorting
- Search
- Status badges

### Definition of Done

Researcher can inspect all row-level results efficiently.

---

## Work Item 12 — Detailed Research Review and Manual Override

### Backend

- Override endpoint
- Preserve automated score
- Recalculate accepted final score
- Store audit history

### Frontend

- Side-by-side expected/model code
- Scores
- notes
- error tags
- override controls
- researcher reason

### Definition of Done

Human researcher can correct automated decisions without losing provenance.

---

## Work Item 13 — Dashboard and Error Analysis

### Backend

Summary aggregations:

- model averages
- metric averages
- perfect/partial/failed counts
- error-tag counts
- unsupported expectation rate
- ground-truth warning count

### Frontend

Build dashboard charts and summary cards.

### Definition of Done

Researcher can compare all models and identify common failure patterns.

---

## Work Item 14 — Ground Truth Validation

### Backend

Evaluate expected rules themselves before model comparison.

Add warnings for:

- invalid syntax
- unknown expectation
- suspicious parameter
- likely table/column misuse

### Frontend

- warning badge in results
- dedicated Ground Truth Warnings view

### Definition of Done

Potential benchmark-label problems are visible and do not silently distort model evaluation.

---

## Work Item 15 — Configurable Metrics and Weights

### Backend

- Metric configuration model
- enable/disable metrics
- weights
- score scales
- validation that enabled weights total 100% or normalize automatically

### Frontend

- metrics settings page
- weight sliders/inputs
- reset to default

### Definition of Done

The research framework can evolve without rewriting the evaluator UI.

---

## Work Item 16 — Excel / CSV Export

### Backend

Generate formatted Excel workbook with:

- original data
- detailed results
- model summary
- metric summary
- error analysis
- ground-truth warnings
- overrides
- run configuration

Use OpenPyXL for readable headers, widths, filters, and frozen panes.

### Frontend

- export button
- select export type

### Definition of Done

The researcher can download a research-ready output workbook.

---

## Work Item 17 — Quality Pass

### Backend

- error handling
- validation messages
- test coverage
- logging
- performance review

### Frontend

- loading states
- empty states
- error states
- responsive tables
- clear research workflow

### Definition of Done

No obvious broken flows in the MVP.

---

# 21. 10-Hour MVP Priority Order

If time is strictly limited to 10 hours, prioritize in this order:

```text
Hour 1     Work Item 01
Hour 2     Work Items 02–03 basic version
Hour 3     Work Item 04
Hour 4     Work Item 05
Hour 5     Work Item 06
Hour 6     Work Item 07
Hour 7     Work Item 08 basic registry
Hour 8     Work Item 10
Hour 9     Work Items 11–12 basic version
Hour 10    Work Item 16 + bug fixes
```

Dashboard polish, advanced regex analysis, ground-truth analysis, and configurable extra metrics can continue after the first working MVP.

---

# 22. Suggested Repository Structure

```text
dq-llm-evaluator/
|
|-- backend/
|   |-- app/
|   |   |-- main.py
|   |   |-- config.py
|   |   |-- db.py
|   |   |
|   |   |-- api/
|   |   |   |-- projects.py
|   |   |   |-- imports.py
|   |   |   |-- metrics.py
|   |   |   |-- runs.py
|   |   |   |-- results.py
|   |   |   |-- exports.py
|   |   |
|   |   |-- models/
|   |   |-- schemas/
|   |   |-- services/
|   |   |   |-- import_service.py
|   |   |   |-- export_service.py
|   |   |
|   |   |-- evaluation/
|   |       |-- parser.py
|   |       |-- canonicalizer.py
|   |       |-- equivalence.py
|   |       |-- syntax_evaluator.py
|   |       |-- execution_evaluator.py
|   |       |-- semantic_evaluator.py
|   |       |-- completeness_evaluator.py
|   |       |-- regex_evaluator.py
|   |       |-- gx_registry.py
|   |       |-- scoring.py
|   |       |-- notes.py
|   |       |-- error_taxonomy.py
|   |
|   |-- tests/
|   |-- requirements.txt
|
|-- frontend/
|   |-- src/
|   |   |-- api/
|   |   |-- components/
|   |   |-- pages/
|   |   |   |-- ProjectsPage.tsx
|   |   |   |-- ImportPage.tsx
|   |   |   |-- MetricsPage.tsx
|   |   |   |-- RunPage.tsx
|   |   |   |-- ResultsPage.tsx
|   |   |   |-- ReviewPage.tsx
|   |   |   |-- DashboardPage.tsx
|   |   |   |-- ExportPage.tsx
|   |   |-- types/
|   |   |-- hooks/
|   |   |-- utils/
|   |
|   |-- package.json
|
|-- sample_data/
|-- docs/
|-- README.md
|-- .env.example
```

---

# 23. Testing Strategy

## Unit tests

Mandatory for:

- AST parsing
- canonicalization
- alias handling
- boundary comparison
- regex normalization
- completeness calculation
- score calculation
- error tagging

## Integration tests

Test:

```text
upload file
-> map columns
-> import
-> run evaluation
-> inspect result
-> override score
-> export workbook
```

## Benchmark regression tests

Create a small fixture based on known examples from the research.

Include cases such as:

1. Exact match = 100%
2. Different call order = 100%
3. `str` vs `text` = equivalent if configured
4. `integer` vs `int` = equivalent if configured
5. `float` vs `decimal` = partial
6. `strict_min=True` when expected inclusive = partial
7. Missing expectation = completeness penalty
8. Invalid GX function = execution failure
9. Regex missing FTP = partial
10. `.tolist()` vs Series value set = equivalent

Regression tests prevent evaluation behavior from changing accidentally during development.

---

# 24. Research Integrity Requirements

The application must clearly distinguish:

- deterministic automated evaluation
- researcher override
- optional future LLM-assisted judgment

Never hide when a result was manually changed.

Never present an LLM-judge result as deterministic.

Every final result should be auditable back to:

- original requirement
- expected output
- model output
- evaluator version
- metric configuration
- automated score
- researcher override, if any

---

# 25. Optional Phase 2 Features

After the MVP is stable, Codex may implement these as separate work items.

## 25.1 LLM Judge Fallback

Only use an external LLM for cases that deterministic rules cannot confidently classify.

Store:

- provider
- model
- prompt version
- response
- confidence
- final researcher acceptance

Do not replace deterministic checks.

## 25.2 Research Analyst Summary

Generate textual analysis such as:

```text
Gemini performs strongly on syntax but frequently maps decimal requirements to float.
Grok has a higher rate of environment-dependent expectations.
ChatGPT has fewer completeness errors but occasionally produces stricter boundary rules.
```

Initially this can be template-based from aggregate statistics.

## 25.3 Prompt Version Comparison

Support comparing:

- Model A Prompt v1
- Model A Prompt v2
- Model A Prompt v3

Treat each as a separate benchmark variant.

## 25.4 Inter-Rater Validation

Allow two researchers to independently override results and calculate agreement later.

## 25.5 Saved Evaluation Protocols

Examples:

```text
Protocol A — Original 4 Metrics
Protocol B — Regex-Focused
Protocol C — Full 10-Metric Framework
```

## 25.6 Re-run Only Changed Cases

When equivalence rules change, re-evaluate only affected rows when possible.

---

# 26. UI Direction

The first frontend phase should prioritize functionality and research usability over visual branding.

Use:

- neutral colors
- readable tables
- compact cards
- clear labels
- code blocks with monospace font
- strong filtering
- minimal animation

Do not spend MVP time on polished branding, marketing pages, or decorative effects.

The main user is a researcher reviewing hundreds of model outputs, so density and clarity matter more than visual decoration.

---

# 27. Important Codex Implementation Rules

Codex must follow these rules while implementing:

1. Do not hard-code ChatGPT, Gemini, or Grok as the only models.
2. Treat model columns dynamically.
3. Do not evaluate solely by exact text comparison.
4. Keep parsing, canonicalization, equivalence, scoring, and notes in separate modules.
5. Do not execute arbitrary uploaded Python with unrestricted `eval()` or `exec()`.
6. Keep automated scores and manual overrides separately.
7. Every partial/failed score should have an explanation or error tag.
8. Add tests before moving to the next evaluation-engine work item.
9. Keep the MVP local-first and simple.
10. Do not add unnecessary auth or cloud infrastructure before the core research workflow works.
11. Do not silently mutate expected outputs.
12. Preserve exact imported source data.
13. Make exports reproducible and include run configuration.
14. Run backend and frontend tests after each work item.
15. Update README and implementation checklist continuously.

---

# 28. Codex Completion Checklist

## Core workflow

- [ ] Create project
- [ ] Upload Excel/CSV
- [ ] Preview sheet
- [ ] Map requirement/expected/model columns
- [ ] Import dynamic model outputs
- [ ] Parse expected and model rules
- [ ] Evaluate syntax
- [ ] Evaluate execution
- [ ] Evaluate semantics
- [ ] Evaluate completeness
- [ ] Calculate final scores
- [ ] Generate explanation notes
- [ ] Persist results
- [ ] Browse/filter results
- [ ] Review a case
- [ ] Override a score
- [ ] Compare models
- [ ] Export Excel

## Research quality

- [ ] Automated score preserved
- [ ] Override audit trail preserved
- [ ] Error taxonomy implemented
- [ ] Ground-truth warning mechanism implemented
- [ ] Metric configuration saved per run
- [ ] Regression fixture created
- [ ] Evaluator version included in export

---

# 29. Final Product Definition

The finished product is not merely a Great Expectations code checker.

It is a **multi-model research evaluation and analysis platform** that helps researchers benchmark LLM-generated data-quality rules in a repeatable, auditable, and explainable way.

Its primary workflow is:

```text
Upload Benchmark
-> Map Any Number of LLMs
-> Configure Research Metrics
-> Run Deterministic Evaluation
-> Review Partial/Failed Cases
-> Apply Researcher Overrides
-> Compare Models
-> Analyze Error Patterns
-> Export Research-Ready Results
```

This workflow is the priority. All architecture and feature decisions should support it.
