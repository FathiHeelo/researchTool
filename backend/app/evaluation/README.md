# Single-pair evaluation

Install the supported GX dependency from the backend directory:

```powershell
.venv/Scripts/python.exe -m pip install -r app/evaluation/requirements.txt
```

Call `evaluate_pair(expected, generated)` from `app.evaluation.engine`.
The result contains independent default component scores and their arithmetic
mean as a percentage. Additional evaluators can be injected by name.

Execution means static invocation/configuration validity against installed GX
1.22.0 definitions, not successful validation of a dataset. Registered trusted
GX classes are instantiated only with statically extracted literal arguments.
Dynamic expressions and unsupported statements cannot receive execution credit.
No submitted Python is executed. Known custom/environment-dependent names can
be supplied to `ExpectationRegistry`; these are reported separately from unknown
names. Hallucination detection means unavailable in this configured environment,
not proof that a function does not exist anywhere.

Semantic comparison uses canonical calls, then matching function/column families
for partial credit. Completeness tracks represented conditions; parameter errors
can retain completeness while lowering semantics. Extra calls are reported
separately. Regex language equivalence is deliberately limited to deterministic
rules; unrecognized relationships remain unknown. This is a base heuristic
evaluator, not a general proof of code equivalence.

GX argument semantics reference:
https://greatexpectations.io/expectations/expect_column_values_to_be_between/
