# benchmarks: current behaviour

Built by `node skills/spec/scripts/behaviour.mjs` from the acceptance lines of the shipped briefs; edit a brief, not this file. A brief that holds a `Supersedes: <brief name>` line replaces that brief.

## bench-honesty
- A comparison of the Karpathy after-file against itself lists run 1 under Excluded and counts 2 flow runs (Task 1).
- A cost rise above the noise bound but under `benchmarkMinRise` is not a regression, and a zero-spread run blocks only past 10% (Task 1).
- A sweep run with `--baseline` writes the section with the excluded runs and a verdict per metric (Task 2).

## karpathy
- Each of Tasks 1 to 11 has a test that its Proof runs.
- The Success criterion runs the full check once.
- Task 12 writes the after-sweep to `.exo/karpathy/sweep-results-after` and compares it to the baseline numbers.

## plan
- The deepseek effort table matches the pick rule on the repeat-3 sweep, results in benchmarks/results (Task 1) and the ledger (Task 8).
- A flow cell on deepseek makes fewer Agent calls at the same score, before/after in a results file (Task 2).
- A run-plan child for a mechanical kind starts with the output cap, or the results file says the harness has no support (Task 4).
- A sweep record on deepseek carries cache hit and miss tokens and a `costUsd` within 20% of the balance delta (Task 6).
- The whole check passes (Success criterion).
- Task 1: meta.json holds the base commit and `baseDirty` only when a base checkout is given, and is unchanged without it.
- Task 2: with a fake arm runner, each repeat runs both arms, launch order alternates, each arm gets its own `pluginDir`, and both arms of a pair are always in flight together.
- Task 3: a fixture of paired records yields the expected `## Paired` lines in the decided order.
- Task 4: `--results x.md` is refused, `--dry-run --base` lists both arms per pair with a projection over both, and the existing sweep tests pass unchanged.
- Success criterion: `npm run check` ends `FAIL=0 WARN=0 UNRUN=0`.
- Task 1: `benchmarks/guard-replay.mjs` prints per family the unique refused inputs and the base and candidate deny, rewrite and pass counts.

## design-ui-fast-preview
- Task 1: sketch-tab.md holds `## The direction round`.
- Task 1: phase-direction `## Rung 3` deals, sketches, waits, then fills, checks and selects the picked contract only.
- Task 1: `## The comps` opens only on the user's words asking for working or live comps.
- Task 3: intake.md holds `## The direction offer` with the sketch-round offer; `node --test tests/question-shape.test.mjs` passes.
- Task 4: SKILL.md routes rung 3 to the sketch round and its rows name the preview and one-pass read sets above; the body stays ≤ 10,000 B.
- Task 5: phase-build.md gives no `COMP` after a sketch pick and limits this session's capture to routes other than the full run.
- Task 6: `node --test tests/benchmark-design-run.test.mjs` passes with `firstPreviewMs` asserted for a sketch run, a picker run and a run with neither.
- Task 7: `node --test tests/design-ui-read-budget.test.mjs` passes. The preview set sums ≤ 30,000 B and the one-pass set ≤ 46,000 B.
- The Success criterion passes on the branch rebased onto `origin/main`.

## lean-open-2
- Task 7: `node benchmarks/routing.mjs` runs the paired arm under `--dry-run` with its sessions and projected cost, and starts no session.
- Success criterion, second done line: `node benchmarks/lean-guards-compare.mjs` exits 0 with bytes <= 2666 and modules <= 77.

## lean-open
- Success criterion, second done line: `node benchmarks/lean-guards-compare.mjs` exits 0 with bytes <= 2666 and modules <= 77; no task adds a module.

## loop-budget-2
- A two-task plan builds with the main session dispatching exo:build-task directly, with no task-runner and no `wait-report.mjs` call (Task 1, Task 2, Task 5).

## run-efficiency
- Tasks 3-5: a headless build session's prompt names no `Report to:` file (Task 5), and `run-plan.mjs` writes the reply text above the last line to `.exo/implementer-<n>.md` before landing (Task 4); seams: `tests/run-plan-red-repair.test.mjs`, `tests/stall-guard.test.mjs`. Gain unmeasured: `benchmarks/results/2026-10-12-flow-run-4b.md:45` counts 6 of about 9 extra tool calls as report writes. Adoption test: rerun the 4b flow sweep (`flow-base` vs `flow-run`, n=4, `--concurrency 1`, under `caffeinate -i`) and adopt if weighted tokens fall and the hidden check stays 4/4.
