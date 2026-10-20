# Land-task refusals in one call

Tested on 2026-10-20 as a $0 offline replay of recorded real-use transcripts. Scripts, prereg and notes are local and untracked in the main checkout under `.exo/self-improve/s9/` (r5-test-J1.md, prereg r5-test-J1-prereg.md).

Idea: `land-task.mjs --check` collects the report-format, lint and code-rules refusals into one result, so the builder fixes them in one round.

VERDICT: FAIL. Replayed saving = 2.88% of the named bucket, bootstrap 95% CI [1.35, 3.92] (pooled real-use, 50 sessions, 508 build-tasks); lower bound is under the 3.0% bar. $0 spent. No branch.
In run terms the saving is $0.43 = 0.10% of run [0.036, 0.19].
Even the upper-bound replay (every later-class `--check` refusal counted as avoidable, edit condition ignored) gives 4.86% [2.36, 6.75], lower bound still under 3.

## Setup (as preregistered in r5-test-J1-prereg.md)
- Corpus: top-level non-sweep, non-bench sessions after 2026-10-09T07:51Z with a build-task subagent: 50 sessions (10 other-project, 40 exo repo), 508 build-tasks. 1469 land-task result calls (1271 with `--check`). Scripts: s9/tests/J1/extract.mjs, an.mjs, data.json.
- Bucket B = request cost of every build-task request that issues a land-task call: $14.86 (3.56% of run in this corpus, which holds only sessions with a build-task; r4-L3's 2.36% used a wider run total).
- Code check: land-task.mjs `checkTask` is sequential (unplanned paths, report format, lint, code rules, gate; each throws on first failure), so the idea is not already implemented.
- Result classes parsed from the result text: report 277, code-rules 135, gate 49, unplanned 24, lint 6, proof 5, usage 135, ok 414, other 424 (runner output).
- Avoidable pairs (consecutive calls, both `--check`): refusal A in {report, unplanned, lint} then refusal B in {lint, code-rules} ordered after A, and none of the files cited in B's failure lines named in any tool call between (report heredoc bodies stripped). 45 pairs: 44 report>code-rules, 1 report>lint. Another 27 report>code-rules/unplanned>code-rules pairs were excluded because the cited file was touched in between. Saving = cost of the request that issued the second call.

| set | S/B | 95% CI | S % of run |
|---|---|---|---|
| pooled (verdict) | 2.88% | [1.35, 3.92] | 0.10% [0.036, 0.19] |
| other projects | 4.58% | [2.90, 5.22] | 0.35% |
| exo repo | 1.20% | [0.35, 2.30] | 0.03% |

## Notes and caveats
- Deviation disclosed: my first run of an.mjs counted a pair as "touched" whenever the report heredoc text (which names changed files) sat in the second call's command, which wrongly excluded 44 pairs (S/B 0.67%). I fixed that measurement bug by stripping `cat > .exo/...` heredoc bodies and by citing only the failure lines, before looking at any threshold-relevant decision. The prereg rule (no tree change between the calls) is unchanged. The first, buggy run was FAIL too.
- Sensitivity, NOT the verdict: against a narrower bucket (only the request cost of refusal-result turns, $4.79) the same saving is 8.95% [4.59, 11.49]. That denominator is nearly the quantity the change removes, which the round-5 brief calls circular. The named bucket is the 2.36%-of-run all-calls figure.
- Nearly all the saving is one pair type: report-format refusal followed by a code-rules refusal (the builder fixes the report, only then meets the code-rule comments). The gate never moves earlier, so the 49 gate refusals contribute nothing.
- Quality guard (no refusal dropped or reordered, exit code unchanged, test showing both lines, gate still skipped after a cheap refusal) not evaluated: no implementation was built after the FAIL.
- Retry when: a cheaper variant (for example the report check also reading the code rules in the same call, only for `--check`) is preregistered against a bucket where the saving can be 3% of it, or report-format refusals grow past their 277 in 508 tasks. Nothing is wrong with the tests or tools I relied on.
