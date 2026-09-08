# DQ-LLM Evaluator

Work Items 01–02: FastAPI and React foundation with local SQLite project persistence.

Requires Python 3.12+ and Node.js 22.12+. Commands below use PowerShell, starting at the repository root.

## Setup

```powershell
Copy-Item .env.example .env
py -m venv backend/.venv
backend/.venv/Scripts/python.exe -m pip install -r backend/requirements.txt
cd frontend
npm install
cd ..
```

Both apps read the root `.env`. Backend settings are `APP_NAME` and `CORS_ORIGINS` (a JSON array). The frontend uses `VITE_API_BASE_URL`; restart Vite after changing it. Only put public values in `VITE_` variables.

## Run

Backend, in one terminal:

```powershell
cd backend
.venv/Scripts/python.exe -m uvicorn app.main:app --reload --port 8000
```

Frontend, in a second terminal:

```powershell
cd frontend
npm run dev
```

Open http://localhost:5173. The home page checks http://localhost:8000/health and shows Connected or Unavailable. Reload the page to check again. API docs: http://localhost:8000/docs.

Use **Projects** to create, list, open, and delete research projects. Deletion requires confirmation. SQLite tables are created automatically when the backend starts; projects persist in `backend/projects.db`, which is ignored by Git. Optional `DATABASE_URL` overrides the location (relative SQLite paths resolve from the backend process working directory). Timestamps are UTC.

Project endpoints: `POST /projects`, `GET /projects`, `GET /projects/{id}`, and `DELETE /projects/{id}`. Names are required (1–200 characters after trimming); descriptions are optional. Missing projects return 404. Tests use isolated temporary databases.

## Research Workflow

1. Create a project.
2. Upload and import a benchmark dataset.
3. Map Requirement, Expected Rule, model output columns, and any research metadata columns.
4. Configure the metric/profile protocol for the run.
5. Run evaluation.
6. Review flagged or partial cases.
7. Use accepted scores, where researcher overrides take precedence over automated scores while preserving both.
8. Analyze the Dashboard and research analytics.
9. Run optional matched statistical comparisons.
10. Export results or generate a replication package.

Core formulas:

- Overall Accuracy: weighted normalized average of enabled metric scores from the run metric snapshot, multiplied by 100.
- Reliability: accepted execution scores equal to 1 divided by eligible responses with numeric execution scores, multiplied by 100.
- Hallucination Rate: responses with recorded invented/unknown function hallucinations divided by eligible responses, multiplied by 100.
- Strategy Delta: for the same model and matched case IDs, Strategy B mean accepted Overall Accuracy minus Strategy A mean accepted Overall Accuracy, reported in percentage points.
- Agreement denominator: only unambiguous matched cases with parseable comparable model outputs are counted; missing responses and unparseable paired outputs are excluded and reported.
- Error occurrence rate: responses containing an error tag divided by eligible responses, multiplied by 100. Multi-label tags are counted independently, so percentages do not need to sum to 100.

Runs, exports, and replication packages include the evaluator version identifier recorded in the run summary.

## Verify

```powershell
cd backend
.venv/Scripts/python.exe -m pytest
cd ../frontend
npm run build
```

On macOS/Linux, use `python3` instead of `py` and `backend/.venv/bin/python` (or `.venv/bin/python` within backend).
