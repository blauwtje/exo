# adhd judge names rule, 2026-11-12

## Change

`benchmarks/adhd/judges/facts.md` gains one rule: a fact ending in "is named" passes when the reply names that part in one or two words matching the name or the part in parentheses ("the lint rule change (CI) is named" passes on "CI lint" or "lint rule"); a reply that leaves the part out still fails. `--rescore --log <quick record>` now re-judges the stored answer texts of both arms with no reply call, and the paired record gains a facts_share interval (not preregistered).

Source: the stored paired record `2026-11-12T18-24-27-857Z.json` (6 cases, 2 answers per case per arm, copy in the worktree `.exo/`). Judge calls only.

## report-nine-changes, missing facts per answer (0-based indexes)

| answer | before (stored) | after |
| --- | --- | --- |
| candidate 1 | 8 | none |
| candidate 2 | 0 | none |
| base 1 | 0 | none |
| base 2 | 0,1,4,6,7,8 | none |

## All 6 cases, same stored answers

| arm | facts_kept before | facts_kept after | facts_share before | facts_share after |
| --- | --- | --- | --- | --- |
| candidate | 25.0% | 41.7% | 76.0% | 80.0% |
| base | 25.0% | 41.7% | 60.0% | 74.0% |

Paired candidate-base intervals, n=6:

| metric | before (stored) | after |
| --- | --- | --- |
| facts_kept | mean 0.000, ci95 -0.438..0.438 | mean 0.000, ci95 -0.438..0.438 |
| facts_share (not preregistered) | mean 0.081, ci95 -0.310..0.472 | mean 0.035, ci95 -0.349..0.418 |
| ratio | mean 0.103, ci95 -0.073..0.279 | mean 0.103, ci95 -0.073..0.279 |

The before facts_share interval comes from the stored verdicts with the new pairedOf, no call. The rule moved the base arm up more (60.0 to 74.0) than the candidate (76.0 to 80.0), so the facts_share gap narrowed.

## Calibrate

`--calibrate --max-usd 0.10`: `facts 36/37 pass_rows=10/10 fail_rows=26/27 built_fail_rows=19/20 deleted_fact_only=18/20`. Against the earlier `facts 36/37 pass_rows=10/10 fail_rows=26/27 built_fail_rows=20/20 deleted_fact_only=19/20`, one built FAIL row moved to PASS (deleted_fact_only 19 to 18 of 20); the total fail_rows stays 26/27 and agreement 36/37. Caveat: the labels are agent-made or of unknown origin. `tests/adhd-references.test.mjs` (free): 75 pass, 0 fail, so the bad references still fail the gates.

## Commands and cost

| command | cost_usd |
| --- | --- |
| `--rescore --log <record> --cases report-nine-changes --max-usd 0.10` (4 answers; projected 0.0019) | 0.0045 |
| `--rescore --log <record> --max-usd 0.20` (21 judged answers; projected 0.0101) | 0.0108 |
| `--calibrate --max-usd 0.10` | 0.0219 |
| paired facts_share from stored verdicts (no call) | 0 |
| `node --import ./tests/clean-run-env.mjs --test tests/adhd-references.test.mjs` | 0 |

Total $0.0372 of the $0.80 budget. The projection counts only answers that pass the literals gate (21 of 24).

## Not rescored

The concise-baseline reply texts are not in the record (it keeps only their mean tokens and visible length), so the concise baseline stays under the old judge; the ratio column is unchanged because it uses stored lengths. No new reply was made. One rescore of the 6 cases is a single sample of a 3-vote judge, so a 1-fact flip is within its stability noise.
