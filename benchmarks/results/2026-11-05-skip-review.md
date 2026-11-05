# Skip the branch review for new, test-first modules, 2026-11-05

`taskReviewer` in `skills/gate/scripts/pick-reviewer.mjs` returns `none (new test-first modules)` when a task's diff only adds files, one of them a test, and its land-time proof record holds `Red: proved`. A `Risk:` field, the inline route or an instruction file still picks the reviewer first, and any modified, deleted or renamed file keeps the review.

## Probe at $0

In the 6 recorded flow-unit cells (`2026-11-speed-roles` and `2026-11-05-runner-dispatch-pilot`), the review stage on the critical path (review-branch dispatch to its notification, plus `merge-reviews.mjs`) took 40.8, 48.2, 41.4, 61.6, 65.1 and 58.1 s of 122, 126, 114, 145, 156 and 141 s cells, 33-42% of each. Each review found `fix=0`.

## Paid arms

Claude Code flow-unit cell, claude-sonnet-5-5 at high, `node benchmarks/sweep.mjs --set flow --cells flow-unit --repeat <n> --confirm`, run on the same evening. The two n=15 arms ran in parallel.

| Arm | n | Median wall | Mean wall | Range | Median cost | Mean cost | Hidden pass | Reviews run |
|---|---|---|---|---|---|---|---|---|
| Pilot, branch `164927ab` | 3 | 84.7 s | 82.5 s | 76-87 s | $0.356 | $0.359 | 3/3 | 0 |
| Skip review, branch `5fc6e4b5` | 15 | 80.0 s | 90.5 s | 67-195 s | $0.336 | $0.337 | 15/15 | 0 |
| Main `06ecb678` | 15 | 133.3 s | 135.2 s | 110-217 s | $0.534 | $0.551 | 15/15 | 15 |

The median wall falls by 53.3 s (-40%) against the same-day main arm and by 56.6 s against the 136.6 s baseline; the target was at most 129.8 s. Mean cost falls by $0.214 (-39%). Spend: $14.39 ($1.08 pilot, $5.05 skip arm, $8.26 main arm).

## Safety

`tests/pick-reviewer-new-modules.test.mjs` shows that a task which also edits an existing file, lacks `Red: proved`, has no test path or has a `Risk:` field still gets `review-branch`, both on `taskReviewer` and through `reviewLines` on a temporary git repo. The gate's scripted checks still run in every cell.

The risk stays open: the review standard (swallowed failures, duplicate truth, dead code) is no longer checked on new modules, and the hidden checks cannot see it.
