# Honest benchmark comparisons and a landing block on regression

## Goal
A benchmark comparison against a baseline leaves out and names every run that bypassed the flow and states a regression plainly, and the gate refuses to land a plan whose benchmark Success criterion shows a regression beyond the runs' own noise bound.

## Verdict
Verdict: go
Objection: with 3 runs per cell the cost spread is about 45% of the mean ($0.187 on $0.418), so the noise bound must come from the runs, not a fixed percentage.

## Decisions
1. Metrics: pass rate blocks on any drop; cost and wall time block only when the flow-run mean is worse than the baseline beyond a bound derived from both runs' spread, through `compareMeans` in `benchmarks/statistics.mjs` (a rise above `RISE_Z` times the standard error of the difference); tokens are reported, not blocking.
2. Baseline: the plan names it under its Success criterion as `Baseline: <results file> @ <commit>`, read with `git show <commit>:<file>`; with none named, the gate prints `baseline: none` and does not block.
3. Override: a Success criterion line `Benchmark-override: <reason>` lets the plan land; the reason goes into the gate line and the squash commit body as a `Benchmark-override:` trailer.
4. A run whose detail reads `0/<N> Plan-task trailers` bypassed the flow: it is left out of every mean and count and listed by row; when fewer than 2 flow runs remain on either side the verdict is `unmeasured` and blocks.
5. Enforcement is a check in `npm run check` and a gate code path, not a hook.
6. The comparison core lives in `lib/benchmark-compare.mjs`, imported by relative path as `gate-run.mjs` already does for `lib/flaky-record.mjs`, because gate and the sweep both call it and lib already imports from `benchmarks/` (`lib/evidence-rules.mjs`), so one module serves both (exo decided; alternative: a copy under `skills/gate/scripts`, refused because two copies drift).
7. The candidate results file is the newest `*-sweep.md` in the Success criterion command's `--results` folder, else in `benchmarks/results/`, so the plan names no date it cannot know (exo decided; alternative: a `Candidate:` line, refused because the sweep picks the file name at run time).
8. The bound reuses `RISE_Z` and the minimum of 2 runs per side reuses the `n < 2` rule of `compareMeans`, so the z needs no new default (exo decided; alternative: a run.json `defaults.benchmark` key for z, refused as a second source for the same z); the one new default is the minimum rise of decision 11.
9. The results check validates the section's shape (a `Baseline:` line, an `Excluded:` line naming each bypassing row or `none`, one `Verdict:` line per metric) rather than regenerating it, because an old baseline may sit only in ignored run folders (exo decided; alternative: full regeneration, refused because it fails every file whose baseline is not committed).
10. The 2026-11-08 Karpathy section is rewritten into the checked shape with the verdict `compareMeans` gives: cost +$0.045 and wall +7.2 s above the baseline, both within the noise bound, so the file says "above the baseline, not shown to be worse" instead of "a regression" (exo decided; alternative: keep "regression", refused because the bound says the data do not show it).
11. Effect-size floor: cost and wall time block only when the rise exceeds both the run-derived noise bound and a minimum relative rise, one overridable default `benchmarkMinRise` (0.10) in run.json `defaults`, so a zero-spread run blocks only past 10% (exo decided because a negligible rise on near-deterministic runs must not block; alternative: the noise bound alone, refused because zero spread would block a 0.1% rise).
12. Override provenance: a `Benchmark-override:` line counts only when it is present in the brief as committed before the run started (the plan's spec commit, found from git history); a line added during the run is ignored and reported in the gate lines (exo decided because the agent whose run regressed must not waive its own block; alternative: trust the working-tree brief, refused because the run can edit it).

## Non-goals
- No new sweep runs and no change to `benchmarks/tbench/` readouts.
- No hook and no change to `improve-speed.mjs` or `speed-ledger.mjs` verdicts; `frontierVerdict` stays the improve-loop rule, because it compares minima, not means with a bound.

## Assumptions
- [code] The results table holds per-run Wall time, Cost, Tokens and a Detail with `<k>/<N> Plan-task trailers` and `hidden check pass|fail` (benchmarks/sweep.mjs:281, benchmarks/sweep-score.mjs:105).
- [code] The Karpathy baseline was $0.418 (sd 0.187) and 105.3 s (sd 45.1), n=3, at 5033ef24, kept only in an ignored file (docs/plans/karpathy.md:26).
- [code] The squash commit body is built in `squashRun` (skills/build/scripts/land-run.mjs:93).
- [code] The gate's Success criterion line sits in `runGate` (skills/gate/scripts/gate-run.mjs:124).
- [assume] Prior art (github-action-benchmark alert thresholds, critcmp baseline compare, asv significance, bencher statistical thresholds) informs the shape; no code or text is copied.

## Acceptance
- A comparison of the Karpathy after-file against itself lists run 1 under Excluded and counts 2 flow runs (Task 1).
- A cost rise above the noise bound but under `benchmarkMinRise` is not a regression, and a zero-spread run blocks only past 10% (Task 1).
- A sweep run with `--baseline` writes the section with the excluded runs and a verdict per metric (Task 2).
- The gate prints `FAIL benchmark` for a fixture regression, `PASS benchmark (baseline: none)` with no baseline, and `WARN benchmark override (<reason>)` with an override (Task 3).
- The squash commit body carries the override trailer (Task 4).
- `npm run check` fails a results file whose comparison counts a bypassing run and passes the rewritten Karpathy file (Tasks 5 and 6, Success criterion).

## Plan basis
Repository: /Users/thomash/Documents/Code/personal/plugins/exo/.worktrees/bench-honesty
Branch: spec/bench-honesty
Worktree setup: none
Land gate: npm run validate:static
Land: local
Commit: feat(benchmarks): exclude flow-bypassing runs from baseline comparisons and block landing on a regression
Lint: none
App: none
Allow: none

## Success criterion
`npm run check`
Red: none (the check passes on the base; the tasks add a check and gate path with their own tests)
Product run: none (a plugin source repo, no bin or start script)

## Checkpoint
- Blocks first: Task 1.
- Parallel: none.
- Shared state: lib/benchmark-compare.mjs, so the tasks run in series.
- Smallest safe split: one task per caller of the comparison core.

## Tasks

### Task 1: feat(benchmarks): compare a results file with a baseline, excluding flow-bypassing runs

Depends on: none | Files: `lib/benchmark-compare.mjs`, `tests/benchmark-compare.test.mjs`, `benchmarks/baseline-compare.mjs` | Data: `parseResultRuns(markdown)` returns per-row runs, `splitFlowRuns(runs)` returns kept and bypassed, `compareToBaseline({ baseline, candidate })` returns a per-cell verdict per metric built on `compareMeans` and `meanAndSd` from `benchmarks/statistics.mjs`, with `minRise` defaulting to `benchmarkMinRise` (0.10) read from run.json `defaults` and a cost or wall verdict of regression only when the rise exceeds both the bound and `minRise`, and `comparisonSection(result)` returns the `## Comparison with the baseline` lines; the CLI exits 1 on a regression or `unmeasured`; the tests cover a rise under `minRise` with a zero spread (no block) and past it (block) | Proof: node --test tests/benchmark-compare.test.mjs && node benchmarks/baseline-compare.mjs --baseline benchmarks/results/2026-11-08-karpathy-flow-unit-after.md --candidate benchmarks/results/2026-11-08-karpathy-flow-unit-after.md

### Task 2: feat(benchmarks): write the baseline comparison from the sweep

Depends on: 1 | Files: `benchmarks/sweep.mjs`, `benchmarks/sweep-score.mjs`, `benchmarks/sweep-baseline.mjs`, `verify/budgets.mjs`, `verify/module-size-ceilings.txt`, `tests/benchmark-sweep-score.test.mjs`, `CONTRIBUTING.md` | Data: a `--baseline <file>@<sha>` flag stored in meta, a `trailers` field on the flow record from `landedTasks`, and `resultsMarkdown` appending `comparisonSection` when meta names a baseline | Proof: node --test tests/benchmark-sweep-score.test.mjs

### Task 3: feat(gate): refuse a benchmark regression against the plan's baseline

Depends on: 2 | Files: `skills/gate/scripts/benchmark-lines.mjs`, `skills/gate/scripts/gate-run.mjs`, `lib/plan-tasks.mjs`, `skills/build/scripts/run-config.mjs`, `skills/spec/scripts/plan-check-frame.mjs`, `skills/gate/references/gate-lines.md`, `tests/gate-benchmark-lines.test.mjs`, `tests/plan-tasks-inputs.test.mjs`, `CONTRIBUTING.md`, `verify/budgets.mjs`, `verify/module-size-ceilings.txt` | Data: `benchmarkOverride` counts only a line present in the brief at the plan's spec commit (found with `git log` on the plan file), and a line added later is ignored and reported as `WARN benchmark override ignored (added after the run started)`, with a test for each of the two cases; `successBaseline` and `benchmarkOverride` parsed from the Success criterion, and `benchmarkLines(plan, { root })` returning `PASS benchmark`, `FAIL benchmark (regression|unmeasured: …)` or `WARN benchmark override (<reason>)` from `compareToBaseline`, pushed after the success-criterion line in `runGate` | Proof: node --test tests/gate-benchmark-lines.test.mjs tests/plan-tasks-inputs.test.mjs

### Task 4: feat(build): carry the benchmark override reason into the squash commit body

Depends on: 3 | Files: `skills/build/scripts/land-run.mjs`, `tests/land-run.test.mjs`, `CONTRIBUTING.md`, `verify/budgets.mjs`, `verify/module-size-ceilings.txt` | Data: `squashRun` adds a `Benchmark-override: <reason>` trailer read with `benchmarkOverride` from the plan | Proof: node --test tests/land-run.test.mjs

### Task 5: feat(verify): check that results comparisons exclude flow-bypassing runs

Depends on: 4 | Files: `verify/checks/baseline-honesty.mjs`, `verify/late-checks.mjs`, `tests/baseline-honesty.test.mjs`, `benchmarks/results/2026-11-08-karpathy-flow-unit-after.md` | Data: `checkBaselineHonesty(root)` flags a `## Comparison with the baseline` section in `benchmarks/results/*.md` that lacks a `Baseline:` line, an `Excluded:` line naming each row `splitFlowRuns` marks bypassed, or a `Verdict:` line per metric | Proof: node --test tests/baseline-honesty.test.mjs

### Task 6: docs(benchmarks): restate the Karpathy comparison without the flow-bypassing run

Depends on: 5 | Files: `benchmarks/results/2026-11-08-karpathy-flow-unit-after.md` | Data: the section in the checked shape, with run 1 excluded, the 2 flow runs' means, and the cost and wall verdicts from `compareMeans` against the recorded baseline | Red: none (a results file rewritten to the shape Task 5 checks) | Evidence: benchmarks/results/2026-11-08-karpathy-flow-unit-after.md | Proof: node verify/checks/baseline-honesty.mjs
