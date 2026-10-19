# Build-field speed: flow-unit A/B, main vs candidate

Compares `main` before commit `a0f90e0b` (arm main) with the change in that commit (arm cand) on the flow-unit set, 2 runs per arm.

## Method

- n=2 per arm, single cell, no significance claim.
- `sweep.mjs --repeat` plans only 1 call for the flow set, so the rounds ran as separate sweeps.
- Tools: `benchmarks/flow-report.mjs`, `build-phases.mjs` (given the transcript path, not the cell dir) and `split.mjs` (lead only). `flow-check.mjs` was not rerun; the hidden result is read from each `record.json` (`hiddenPass`, `defects`).
- Per-agent tool-call and turn counts come from a throwaway script over the lead transcript and its `subagents/` jsonl; turns = distinct assistant message ids. wait-report, land-slot and land-task count tool calls whose input contains the name.

## Per run

| run | wall s | cost $ | tokens | lead calls/turns | run-unit calls/turns | landing-phase tokens | wait-report | land-slot | landed | hidden |
|---|---|---|---|---|---|---|---|---|---|---|
| main  | 294.0 | 0.870 | 325072 | 18/20 | 16/13 | 5765 | 1 | 0 | 4/4 | FAIL (3 defects) |
| main2 | 280.9 | 0.897 | 312942 | 21/21 | 15/11 | 5922 | 2 | 0 | 4/4 | FAIL (3 defects) |
| cand  | 248.0 | 0.810 | 301322 | 19/21 | 15/12 | 6110 | 1 | 2 | 4/4 | FAIL (3 defects) |
| cand2 | 124.7 | 0.623 | 231769 | 12/13 | 13/11 | 0 (phase absent) | 1 | 1 | 4/4 | FAIL (3 defects) |

Each run had one run-unit and four build-task dispatches. Review-branch dispatches: main 2, main2 2, cand 2, cand2 1. Fix-review: main 1, main2 1, cand 1, cand2 0.

## Per arm

| arm | wall s | cost $ | tokens | lead calls | run-unit calls | landing tokens | wait-report | land-slot |
|---|---|---|---|---|---|---|---|---|
| main mean | 287.4 | 0.883 | 319007 | 19.5 | 15.5 | 5844 | 1.5 | 0 |
| cand mean | 186.4 | 0.717 | 266546 | 15.5 | 14.0 | 3055 | 1.0 | 1.5 |
| cand vs main | -35.2% | -18.9% | -16.4% | -4.0 | -1.5 | -48% | -0.5 | +1.5 |

## Result

- Wall time is not gated. The -35.2% mean rests on cand2 (124.7 s), which skipped the fix-review and the second review-branch stage. cand alone is 248.0 s, -14% against the main mean.
- Cost -19% and tokens -16% are direction only: n=2 and the cand2 outlier.
- Lead calls -4.0 and run-unit calls -1.5 per run on the means.
- The landing-token drop is partly an artifact: cand2 shows 0 because no landing-phase call was classified. wait-report is not removed: 1 call in each cand run.
- Quality is equal: 4/4 landed in all runs. The same 3 `truncate` hidden tests fail in all 4 runs, main included (cuts a text one character over max; returns exactly max characters when it cuts; returns only the dots when max is 3), so that is a fixture or plan issue, not this change. The A/B cannot separate the arms on quality.
- No misroute, re-dispatch or block in cand: one run-unit and four build-task dispatches in every run. The run-unit effort setting was not checked.
