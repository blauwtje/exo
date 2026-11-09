# lib: current behaviour

Built by `node skills/spec/scripts/behaviour.mjs` from the acceptance lines of the shipped briefs; edit a brief, not this file. A brief that holds a `Supersedes: <brief name>` line replaces that brief.

## bench-honesty
- A comparison of the Karpathy after-file against itself lists run 1 under Excluded and counts 2 flow runs (Task 1).
- A cost rise above the noise bound but under `benchmarkMinRise` is not a regression, and a zero-spread run blocks only past 10% (Task 1).
- The gate prints `FAIL benchmark` for a fixture regression, `PASS benchmark (baseline: none)` with no baseline, and `WARN benchmark override (<reason>)` with an override (Task 3).

## fast-task-gate
- `killTree` with `platform: 'win32'` calls its `run` stub with `taskkill` and `['/pid', '<pid>', '/T', '/F']`; on POSIX a detached shell's grandchild is gone after `killTree`; a timed-out verify Proof and gate still fail with `timed out after <n>s` (Task 2; seam: `tests/process-tree.test.mjs`, `tests/verify-gate.test.mjs`).
- `runTreeSync` past its deadline returns `timedOut: true` and a grandchild that would write a marker file after the deadline writes none; a passing command returns status 0 with stdout and stderr merged (Task 3; seam: `tests/process-tree.test.mjs`).
- `next-task.mjs --in-flight 2` prints `Start:` with only tasks disjoint from Task 2, within `WAVE_LIMIT`, and `Start: none` when the window is full (Task 6; seam: `tests/next-task.test.mjs`, `tests/plan-tasks.test.mjs`).

## brief
- `node --test tests/harness-capabilities.test.mjs` passes and fails when a matrix row and an adapter disagree (Task 1).

## small-items
- Task 4: a task brief from next-task carries the plan's Decisions.
