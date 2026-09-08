# Paired comparison policy

Variants are chosen by metadata key; values and model names are discovered.
Only a single observation on each side for the same Case ID with identical
requirement/reference text is comparable. Duplicate observations across runs or
experimental contexts are reported as ambiguous, not averaged into artificial
replicates. Unmatched and ambiguous counts are separate from ground-truth
exclusions. Excluding a flagged case removes both sides of the pair.

Every outcome uses its own complete pairs. Null, malformed and non-finite values
are omitted together with their counterpart and counted. Execution must be 0 or 1.
Accuracy uses accepted run-normalized scores; component differences use stored
raw scales and should not be interpreted across incompatible metric scales.

Formal tests are optional. A conservative minimum of six complete pairs is used;
Wilcoxon additionally requires six nonzero differences. This is a reporting
policy, not assurance of adequate power. All-zero pairs remain descriptive with
insufficient_data status. SciPy performs two-sided Wilcoxon with its auto method,
Wilcox zero handling and differences rounded to the stored eight-decimal accuracy
precision. SciPy version is returned. Paired rank-biserial correlation uses average
tied absolute ranks after omitting zeros; positive values indicate larger B scores,
not causality. Wilcoxon assumes independent pairs and symmetric differences.

Binary tests use exact two-sided McNemar via SciPy's binomial test on discordant
pairs. The reported statistic is min(n01,n10), not a chi-square statistic. No
discordance returns insufficient_data. Means are binary proportions, while mean
differences are also provided as percentage points.

Holm correction applies step-down monotone adjustments across successful tests
in the current request. Raw and adjusted values are returned separately. Separate
exploratory requests do not form one automatically corrected family. No automatic
significance, superiority, or causal conclusions are produced.

Protocols store validated configuration only. Updates require an expected version
and increment it. New runs store protocol ID, version, and full configuration in
their existing JSON summary. Deleting/editing a protocol never edits snapshots.
Study Default is a built-in profile; omitted protocol selection preserves legacy
current-project metric settings. Warning policy is an analysis default, not an
instruction to delete/evaluate fewer benchmark cases.

References: https://docs.scipy.org/doc/scipy/reference/generated/scipy.stats.wilcoxon.html
and https://docs.scipy.org/doc/scipy/reference/generated/scipy.stats.binomtest.html
