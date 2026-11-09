# Paired A/B sweep

## Goal
`node benchmarks/sweep.mjs --base <checkout>` runs every cell and repeat as a base and candidate pair started together, and its published report carries a `## Paired` section of candidate-minus-base differences with 95% CIs.

## Verdict
Verdict: go
Objection: launching both arms of a pair at once doubles the load per pair and model latency still varies, so the paired difference narrows the noise but does not remove it; judge speed on tokens, turns and cost first and on wall time second.

## Decisions
1. New flag `--base <checkout path>`; each cell and repeat runs one arm with the base checkout as the plugin and one with this checkout (`ROOT`), both started together, base first on an odd repeat index and candidate first on an even one.
2. `--concurrency` counts runs; a pair is never split, so the pool runs `Math.ceil(concurrency / 2)` pairs at a time.
3. Arm run folders are `<cell>-<n>-base` and `<cell>-<n>-cand`, with `n` counted from 1 also at `--repeat 1`; each record gains `arm: 'base' | 'cand'`.
4. meta.json `pluginCommits` gains the base checkout's commit under its path, and `baseDirty` records its dirty state; both appear only with `--base`.
5. The report's `## Paired` section lists n pairs, then per metric the mean of cand minus base with its 95% CI from `pairedDiff` in lib/eval-stats.mjs, in the order tokens, cost, hidden-check pass, wall time.
6. Turns are left out of `## Paired`, because a sweep record holds no turn count (benchmarks/sweep.mjs:377-391) (exo decided).
7. `--base` with a chosen cell that has a plugin variant is refused, because variant copies are made from this checkout only (benchmarks/sweep.mjs:510-513) (exo decided).
8. `--results` ending in `.md` is refused before any run, naming the folder form and the `<date>-sweep.md` file the sweep publishes into it.
9. The arm's checkout reaches the cell through the one `pluginDir` in `runClaude` (benchmarks/sweep.mjs:161), which feeds both `claudeArguments` and `runArguments` (benchmarks/sweep-cells.mjs:297-315) (exo decided).
10. benchmarks/sweep.mjs stays within its 29200-byte ceiling: run metadata moves to a new benchmarks/sweep-meta.mjs to make room, and the ceiling line is lowered to the file's final size (exo decided).
11. Pairing and the paired report live in two new modules, each within the 8192-byte module cap (verify/budgets.mjs:122) (exo decided).

## Non-goals
- No change to benchmarks/run.mjs or benchmarks/confined-child.mjs: the checkout reaches them through `runArguments` and `claudeArguments` already.
- No ledger, results or CHANGELOG.md edit in a task.

## Assumptions
- [code] The first arm a pair worker calls spawns first, because `runCell` runs `prepareRepository` synchronously and `runClaude` spawns inside its Promise executor (benchmarks/sweep.mjs:359-368, 156-175).
- [code] A paid entry point must reach lib/eval-stats.mjs or benchmarks/statistics.mjs, and a `-report.mjs` file counts as a scorer (verify/checks/benchmark-entry-points.mjs:5-20, 137-142).

## Acceptance
- Task 1: meta.json holds the base commit and `baseDirty` only when a base checkout is given, and is unchanged without it.
- Task 2: with a fake arm runner, each repeat runs both arms, launch order alternates, each arm gets its own `pluginDir`, and both arms of a pair are always in flight together.
- Task 3: a fixture of paired records yields the expected `## Paired` lines in the decided order.
- Task 4: `--results x.md` is refused, `--dry-run --base` lists both arms per pair with a projection over both, and the existing sweep tests pass unchanged.
- Success criterion: `npm run check` ends `FAIL=0 WARN=0 UNRUN=0`.

## Manual checks
- Make a worktree of commit 52ac3bc8, then run `node benchmarks/sweep.mjs --set flow --cells flow-unit --repeat 10 --base <that worktree> --confirm` from main; the published results file shows a `## Paired` section with 10 pairs.

## Plan basis

Repository: ~/code/exo
Branch: spec/paired-sweep
Worktree setup: none
Land gate: npm run validate:static
Land: local
Commit: feat(sweep): run a base and a candidate checkout as paired arms under the same load
Lint: none
App: none
Allow: none

## Success criterion

`npm run check`
Red: none (the repo gate passes on its base by design; each task's Proof is seen red, then green)
Product run: none (package.json has no bin and no start script)

## Checkpoint

- Blocks first: none.
- Shared state: Tasks 1 and 4 share `benchmarks/sweep.mjs`, `verify/module-size-ceilings.txt`, `verify/budgets.mjs` and `CONTRIBUTING.md`, so Task 4 depends on Task 1.
- Smallest safe split: Tasks 1, 2 and 3 as separate modules with their own tests, then Task 4 wires them into sweep.mjs.
- Parallel: Tasks 1, 2 and 3.

## Tasks

### Task 1: feat(sweep): move run metadata to sweep-meta.mjs and record a base checkout

Depends on: none | Files: `benchmarks/sweep-meta.mjs`, `benchmarks/sweep.mjs`, `verify/module-size-ceilings.txt`, `verify/budgets.mjs`, `CONTRIBUTING.md`, `tests/benchmark-sweep-meta.test.mjs` | Data: the existing meta.json object, whose `pluginCommits` map gains the base checkout's path and commit and which gains `baseDirty` only when `readOrWriteMeta` is given a base | Evidence: none (a benchmark script, no skill or agent wording) | Proof: node --test tests/benchmark-sweep-meta.test.mjs

### Task 2: feat(sweep): pair each cell and repeat into base and candidate arms that start together

Depends on: none | Files: `benchmarks/sweep-paired.mjs`, `tests/benchmark-sweep-paired.test.mjs` | Data: an array of pairs, each the two arm cells of one cell and repeat with `arm`, `pluginDir`, `repeat` and a `<cell>-<n>-<arm>` `directory`, ordered by launch, plus a pool that runs `Math.ceil(concurrency / 2)` pairs through an injected arm runner | Evidence: none (a benchmark script, no skill or agent wording) | Proof: node --test tests/benchmark-sweep-paired.test.mjs

### Task 3: feat(sweep): report paired arm records as a Paired section with pairedDiff CIs

Depends on: none | Files: `benchmarks/sweep-paired-report.mjs`, `benchmarks/suites.json`, `tests/benchmark-sweep-paired-report.test.mjs` | Data: a markdown `## Paired` section built from records matched on `id`, `repeat` and `arm`, one line per metric from `pairedDiff` over tokens, costUsd, hiddenPass and wallMs | Evidence: none (a benchmark script, no skill or agent wording) | Proof: node --test tests/benchmark-sweep-paired-report.test.mjs

### Task 4: feat(sweep): add --base to run and publish the sweep as paired arms

Depends on: 1, 2, 3 | Files: `benchmarks/sweep.mjs`, `benchmarks/sweep-flow-measure.mjs`, `benchmarks/suites.json`, `verify/module-size-ceilings.txt`, `verify/budgets.mjs`, `benchmarks/README.md`, `CONTRIBUTING.md`, `tests/benchmark-sweep-base.test.mjs`, `tests/benchmark-sweep-repeat.test.mjs`, `tests/benchmark-ideate-worker-score.test.mjs` | Data: `options.base` threaded as each arm cell's `pluginDir` into `runClaude`, `arm` added to the record, and the `## Paired` section appended to the published results only when `options.base` is set | Evidence: none (a benchmark script and its README, no skill or agent wording) | Proof: node --test tests/benchmark-sweep-base.test.mjs tests/benchmark-sweep-repeat.test.mjs
