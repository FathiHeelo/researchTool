# Research analytics and reproducibility

Metric settings belong to a project. Each new run stores its profile and evaluator
version in its existing JSON summary; no existing run columns or results are
rewritten. Runs predating profiles retain their original equal-weight policy over
their stored metric keys. Unknown/custom metric evaluators produce null until a
score is available (including researcher review); no automated value is invented.
Only enabled positive-weight metrics contribute. Missing or out-of-scale required
scores make overall accuracy unavailable. Enabled weights are normalized safely.

Accepted values overlay explicit researcher overrides on automated values. Review
and export retain these separately. All analytics use the run's profile, never the
current project settings. Reliability excludes null execution values from its
denominator. Error counts are response occurrences, with duplicate tags within a
response counted once; multi-label percentages need not sum to 100%.

Strategy/dimension/group fields are selected by metadata key. No metadata values
are predefined. Strategy deltas match case IDs with consistent requirement and
reference text. Repeated observations are averaged within each case/strategy, then
cases receive equal weight. Unmatched or inconsistent cases are reported and do
not enter the delta. Agreement compares parsed expectation-function sets, ignoring
order/formatting/receiver names; it does not assert full argument equivalence.
Repeated case/model observations are ambiguous for agreement and are reported as
non-comparable. Unsupported statement structures and unparseable outputs never
agree. Pairwise rates use comparable cases, exposing matched and excluded counts.
Strategy summaries weight pairwise rates by comparable observations.

Ground-truth warnings are advisory and persist using the existing per-result
relationship. Validation is computed once per imported case during a batch. No
warning changes scores or removes evidence. Every analytics endpoint defaults to
including flagged cases and supports explicit exclusion with counts. Column/table
correctness is not guessed without authoritative schema evidence.

Exports use persisted data only. CSV uses UTF-8 BOM and escapes formula-leading
text for spreadsheet safety. XLSX stores text as text, escapes unsupported control
characters as Unicode escape sequences, and rejects overlong cells with a readable
instruction to use CSV rather than silently truncating research evidence. Original
snapshots are included for source traceability. Export files are generated in memory.
