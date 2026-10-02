# exo speed pass

## Goal
An exo build > verify run on a fixed plan finishes in less wall time and fewer total tokens than on main, with every task landed, the gate passing and no more branch-review findings.

## Decisions
- Waves in small plans: `nextWave` (`lib/plan-tasks.mjs:325`) returns a one-task wave when `tasks.length < 4`; lower that floor to 2 and keep `WAVE_LIMIT = 4` (`lib/plan-tasks.mjs:319`). Rival: keep 4. Cost if wrong: worktree overhead on 2-3 task plans eats the gain (seconds with `Worktree setup: none`). Closed by: design agent; evidence `benchmarks/results/2026-09-29-small-waves.md` (a wave of 4 halved the build phase, 302 s to 153 s, 0 conflicts).
- plan-check flags a plan with two tasks sharing no `Depends on:` chain and no `Worktree setup:` line, since without it `nextWave` never builds a wave (weakness 2: no measured run had a wave). Rival: write `Worktree setup: none` silently in spec. Cost if wrong: one extra plan-check finding per plan. Closed by: design agent.
- Gate: `verify.mjs` (`skills/verify/scripts/verify.mjs:141-160`) already skips a Proof equal to the gate, a suite run under the default gate, and one land-task passed on the same tree. It also skips a repeated Proof command and a `node --test <files>` Proof whose every file the default gate's own `node --test` globs (`package.json` `scripts.test`) cover, since the gate runs those files on the same tree. The post-repair rerun (`skills/verify/SKILL.md:25`) stays a full `verify.mjs` run, now cheaper. Rival: `--changed-since <rev>` reruns scoped by `Files:`. Cost if wrong: a Proof the glob match misreads runs once more; no test is skipped that the gate does not run. Closed by: design agent; evidence audit-report.md item 2 (7 gate runs, 1227 s, 111-294 s each).
- Lead reads `git diff --stat` on a GREEN return and the full diff only on a non-GREEN return or a land-task refusal (`skills/build/references/run-loop-direct.md:3`). Rival: keep full diffs. Cost if wrong: lead lands a mis-described diff; land-task refusals and the branch review (weakness 3: fired every run) still catch it. Closed by: design agent.
- build-task effort split: compact (Proof-only) tasks on `build-task` at `medium`; long-format tasks (`Run:`/`Expected:`/`Commit:`) on a new `build-task-long` at `high`, both through a kind in `lib/model-kinds.json`. Rival: keep `high` for all; or `low` for compact. Cost if wrong: more repair findings on compact tasks; the benchmark's findings count guards it. Closed by: design agent; basis research.md section 3.
- Review fixer: a named agent `fix-review` (Sonnet, bounded tools, `omitClaudeMd`) replaces the `general-purpose` dispatch at `skills/verify/SKILL.md:24`; the dispatch keeps sending `skills/build/review-fixer-prompt.md`. The branch review stays (weakness 3). Rival: keep general-purpose. Cost if wrong: the fixer misses context a general agent gathers; `node benchmarks/sweep.mjs --set fixer` measures it. Closed by: design agent.
- Reader routing: `skills/route-skills/references/context.md` (next to its reader-budget line 12) sends read-only discovery to `exo:locate-code`, one question per dispatch with independent questions dispatched in parallel, and `general-purpose` only for edits or when no named agent fits. Rival: a Sonnet reader at 70k. Cost if wrong: Haiku misses on a broad question and the caller asks again. Closed by: design agent; evidence: in this design run, an 8-question and one of two 4-question locate-code dispatches hit the 20-turn limit with no answer despite `agents/locate-code.md:16`, while a 2-question dispatch answered in 6 tool calls.
- Hard tasks: plans carry no field build reads for this, so Task 8's hardness sits in `## Ranking`; the lead dispatches it to `exo:solve-hard`. Closed by: design agent.
- Kept: `BLOCK_TASK_LIMIT` (`lib/plan-tasks.mjs:353`), wait-report constants, land-task per-task gate, ladder reads. Deferred: nesting showed no speed gain or loss (metrics verdict 5); land-task 42 runs = 198 s; ladder duplicates under 0.1%; forks and cache TTL settings have no measured sink.
- Benchmark: the sweep `flow` cell (input: fixed four-task plan `docs/plans/text-helpers.md`, `benchmarks/sweep-fixtures.mjs:17-21`; skill path: `build` then `verify` under `claude -p --plugin-dir <this clone>`, Sonnet 5 at `high`), run 3 times per arm sequentially into `--out benchmarks/runs/speed-<arm>-<n>`, median reported. Arm main runs from this worktree before any other task lands (Task 1); arm branch after every task (Task 9). Measures: `wallMs`, `tokens` and `costUsd` from each cell's `record.json` (`benchmarks/sweep.mjs:174-187`), cross-checked with `.git/exo/handoff/speed/measure.py` over the cell transcripts, and lead peak from `benchmarks/cell-usage.mjs`. Pass: 4/4 tasks landed, the fixture's Success criterion passes, the verify gate exits 0, branch-review findings count not above main's median. Rival: one run per arm (cost if wrong: n=1 load noise, as in small-waves). Cost: about $3 per cell, about $18 total. Closed by: design agent.

## Acceptance
- Task 9's table in `benchmarks/results/2026-10-02-speed.md` shows branch median wall and total tokens below main's, with the benchmark's pass criteria met on both arms.
- The Success criterion passes.

## Ranking
Ranked by expected saving per unit of risk; savings are over the 5 measured exo build/verify sessions (170 min wall, 49.4M cache_read in the group).
- Task 2: 8-15 min of 20.5 min gate time; tokens small. Guard: the gate runs every skipped test file on the same tree. Risk: low.
- Task 3 with Task 4: 15-25 min of 58 min serial build-task wall; tokens about neutral. Guard: `nextWave`'s path-overlap check and land-task's cherry-pick refusal. Risk: medium-low.
- Task 5: 1.5-3M of 21.9M main cache_read; time small. Guard: land-task refusals and the branch review. Risk: low.
- Task 6: 15-30% of build-task output (159k) and calls; 5-10 min. Guard: each task's Proof, the branch review, the benchmark findings count. Risk: medium.
- Task 7: reader cost at Haiku price ($1/$5 against $2/$10 or more) on part of the 13.1M general-purpose cache_read. Guard: locate-code's `Unsure:` label and the caller's re-ask. Risk: medium.
- Task 8 (hard): part of 53 min review-to-end; fixers are 5 of 15 general-purpose agents. Guard: the branch review stays and verify reruns after the fix. Risk: medium.

## Plan basis
Repository: /Users/thomash/Documents/Code/personal/plugins/exo/.worktrees/speed
Branch: speed
Worktree setup: none
Land gate: npm test

## Success criterion
`npm run check` passes.

## Checkpoint
- Blocks first: Task 1.
- Parallel: Tasks 2, 3, 4, 5 and 7.
- Shared state: `benchmarks/results/2026-10-02-speed.md` (Tasks 1, 9), `skills/build/references/run-loop-direct.md` (Tasks 5, 6), `lib/model-kinds.json` and `README.md` (Tasks 6, 8).
- Smallest safe split: one task per lever; shared files serialized by Depends on.

## Tasks
### Task 1: test(benchmarks): record the main arm of the speed benchmark
Depends on: none | Files: `benchmarks/results/2026-10-02-speed.md` | Data: one table row per main run (3 runs into `benchmarks/runs/speed-main-1` to `-3`) from each cell's `record.json` | Proof: node benchmarks/sweep.mjs --set flow --confirm --out benchmarks/runs/speed-main-1
### Task 2: perf(verify): skip repeated Proofs and Proofs the default gate already runs
Depends on: 1 | Files: `skills/verify/scripts/verify.mjs`, `tests/verify-gate.test.mjs` | Data: a `Set` of queued Proof commands plus the test globs parsed from `package.json` `scripts.test` | Proof: node --test tests/verify-gate.test.mjs
### Task 3: perf(build): admit a parallel wave in plans of two or more tasks
Depends on: 1 | Files: `lib/plan-tasks.mjs`, `tests/plan-tasks.test.mjs` | Data: the existing wave array, its plan-size floor lowered from 4 to 2 | Proof: node --test tests/plan-tasks.test.mjs
### Task 4: perf(spec): flag independent tasks in a plan with no Worktree setup line
Depends on: 1 | Files: `skills/spec/scripts/plan-check.mjs`, `tests/plan-check.test.mjs` | Data: one finding string per plan | Proof: node --test tests/plan-check.test.mjs
### Task 5: perf(build): read the diff stat on a GREEN return
Depends on: 1 | Files: `skills/build/references/run-loop-direct.md`, `tests/implementing-waves.test.mjs` | Data: one instruction line and its asserted text | Proof: node --test tests/implementing-waves.test.mjs
### Task 6: perf(agents): run compact build tasks at medium effort
Depends on: 5 | Files: `agents/build-task.md`, `agents/build-task-long.md`, `lib/model-kinds.json`, `README.md`, `skills/build/references/run-loop-direct.md`, `agents/run-unit.md` | Data: one kind entry per agent file in `lib/model-kinds.json` | Proof: node --test tests/agents.test.mjs
### Task 7: perf(route-skills): send read-only discovery to locate-code one question at a time
Depends on: 1 | Files: `skills/route-skills/references/context.md` | Data: one routing rule beside the reader-budget line | Proof: npm run validate
### Task 8: perf(verify): repair review findings through a named fix-review agent
Depends on: 6 | Files: `agents/fix-review.md`, `skills/verify/SKILL.md`, `lib/model-kinds.json`, `README.md`, `tests/implementing-push-gate.test.mjs` | Data: one agent file and its kind entry | Proof: node --test tests/agents.test.mjs
### Task 9: test(benchmarks): record the branch arm and compare it with main
Depends on: 2, 3, 4, 6, 7, 8 | Files: `benchmarks/results/2026-10-02-speed.md` | Data: one table row per branch run plus a median row per arm | Proof: node benchmarks/sweep.mjs --set flow --confirm --out benchmarks/runs/speed-branch-1
