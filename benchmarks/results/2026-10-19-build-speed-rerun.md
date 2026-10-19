# Build-field speed A/B rerun: flow-unit, base vs candidate, n=3

Reruns [the n=2 A/B](2026-10-19-build-speed.md) after `cdd14b5b` fixed its two faults: the compact plan now states each helper's behavior (the hidden `truncate` tests passed in no arm before) and `sweep.mjs --repeat` plans one call per repeat for the flow set.

## Method

- Arm base: `09a8486c` (pre-change main plus the flow-unit benchmark plumbing) with `cdd14b5b` cherry-picked, clean. Arm cand: `cdd14b5b`, which holds `a0f90e0b`. The arms differ in the `a0f90e0b` non-benchmark files (`agents/run-unit.md`, `lib/model-kinds.json`, `skills/build/references/rolling-window.md`, `skills/build/scripts/land-slot.mjs`, tests, `CONTRIBUTING.md`), plus `CHANGELOG.md`, the old results doc and the behavior-neutral split of `flowPlanText` in `benchmarks/sweep-fixtures.mjs` (same generated plan text, checked by hash).
- `node benchmarks/sweep.mjs --set flow --cells flow-unit --repeat 3 --concurrency 2 --confirm` in each arm's own worktree, both arms started together, six `claude -p` calls, $4.11 in total. No timeout, no hang.
- Counts come from `.exo/speed/ab2/count.mjs` (not tracked; it reproduced the old A/B's numbers on the old records): tool calls are `tool_use` blocks, wait-report, land-slot and land-task are Bash calls naming the script, hidden pass count is 17 minus the failing hidden tests in `record.json`, run-unit effort is read from each subagent's `meta.json`.

## Per run

| run | wall s | cost $ | tokens | lead calls | run-unit calls | run-unit wall s | land-slot | wait-report | hidden | landed | review-branch | fix-review | run-unit effort |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| base-1 | 180.1 | 0.657 | 246573 | 15 | 18 | 89 | 0 | 3 | 17/17 | 4/4 | 1 | 0 | medium |
| base-2 | 210.7 | 0.609 | 230067 | 15 | 16 | 99 | 0 | 1 | 17/17 | 4/4 | 1 | 0 | medium |
| base-3 | 317.2 | 0.586 | 226763 | 18 | 12 | 210 | 0 | 0 | 17/17 | 4/4 | 1 | 0 | medium |
| cand-1 | 189.5 | 0.779 | 310569 | 23 | 14 | 70 | 3 | 2 | 17/17 | 4/4 | 2 | 1 | low |
| cand-2 | 149.4 | 0.628 | 233869 | 17 | 13 | 65 | 1 | 1 | 17/17 | 4/4 | 1 | 0 | medium |
| cand-3 | 274.8 | 0.846 | 305848 | 21 | 12 | 129 | 0 | 0 | 17/17 | 4/4 | 2 | 1 | low |

## Per arm: mean (sd)

| metric | base | cand | delta, all runs | delta, without cand-2 |
|---|---|---|---|---|
| wall s | 236.0 (72.0) | 204.6 (64.1) | -13.3% | -1.6% |
| cost $ | 0.617 (0.036) | 0.751 (0.112) | +21.7% | +31.7% |
| tokens | 234468 (10613) | 283429 (42985) | +20.9% | +31.5% |
| tokens excl. review and fix | 208410 | 235907 | +13.2% | +21.2% |
| lead calls | 16.0 (1.7) | 20.3 (3.1) | +4.3 | +6.0 |
| run-unit calls | 15.3 (3.1) | 13.0 (1.0) | -2.3 | -2.3 |
| run-unit wall s | 132.5 (67.3) | 87.9 (36.0) | -33.7% | -24.9% |
| land-slot calls | 0 | 1.3 | +1.3 | +1.5 |
| wait-report calls | 1.3 (1.5) | 1.0 (1.0) | -0.3 | -0.3 |

Cand-2 skipped fix-review and the second review-branch, as the old cand2 did. Here base skipped them in all three runs and cand ran them in two, so the stage mix is reversed and favours base on cost and tokens; the all-runs cost and token deltas mostly measure that. On the three stage-skipping runs only (base 3, cand-2 alone) wall is -36.7%, cost +1.8%, tokens -0.3%.

## Result

- Quality: hidden 17/17 and landed 4/4 in every run, both arms. The fixture grades now; equal at ceiling, so quality cannot separate the arms.
- Run-unit effort is visible in each subagent's `meta.json`, not in `record.json` or `usage.json`. Cand applied `low` in 2 of 3 runs (cand-2 kept `medium`); base ran `medium` in all three.
- Foreground `Next:` waits occurred in every run (Task 1; all four tasks in base-3 and cand-3). In none did run-unit call `wait-report` after a foreground build, base included, so the new rule was reachable but changed no behavior. All 7 wait-report calls are the `--any` wait after a background `Wave:`, which the change keeps. Land-slot ran in the two runs with a wave.
- Run-unit calls (-15%) and run-unit wall time (-25% to -34%) fell in cand, with overlapping ranges (run-unit wall: cand 65-129 s, base 89-210 s).
- Total wall, cost and tokens show no effect that n=3 can support.

## Caveats

- n=3 per arm, one cell, one plan, one model, no significance claim. Wall sd is 64-72 s on a 150-320 s range; the standard error of a 3 v 3 mean difference is near 60 s, above every wall delta here.
- The sign of the cost and token deltas depends on whether stage-skipping runs are kept; the review stages are the lead's choice and swing a run by 20-45k tokens. With the stage mix reversed from the old A/B, neither A/B alone gives the change's cost effect.
- Only 2 of 3 cand runs ran at `low` effort, so the effort change is itself a partial treatment.
- `build-phases.mjs` classifies landing by `land-task` and the lead's turns, so its landing-phase figure (0 in base, 0 to 12.9k in cand) is not a landing measure; the land-aware figure in the run script (about 32k in both arms) counts whole messages and is also coarse.
- The base arm's plugin commit is `d84ce6dc`, the cherry-pick of `cdd14b5b` onto `09a8486c`; it is a worktree branch, not on `main`.
