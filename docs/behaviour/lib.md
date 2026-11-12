# lib: current behaviour

Built by `node skills/spec/scripts/behaviour.mjs` from the acceptance lines of the shipped briefs; edit a brief, not this file. A brief that holds a `Supersedes: <brief name>` line replaces that brief.

## bench-honesty
- A comparison of the Karpathy after-file against itself lists run 1 under Excluded and counts 2 flow runs (Task 1).
- A cost rise above the noise bound but under `benchmarkMinRise` is not a regression, and a zero-spread run blocks only past 10% (Task 1).
- The gate prints `FAIL benchmark` for a fixture regression, `PASS benchmark (baseline: none)` with no baseline, and `WARN benchmark override (<reason>)` with an override (Task 3).

## plan
- A run-plan child for a mechanical kind starts with the output cap, or the results file says the harness has no support (Task 4).
- `exo claude --provider deepseek` at a peak time prints the off-peak notice (Task 5).
- A Reddit quote saved by the source script verifies offline (Task 7).
- Over-limit commands are rewritten, not denied: Task 1. Per-call ms: Task 2.
- Task 2: a subagent's `git stash` runs as a saved patch and never reaches the shared stash list; `git stash pop` is still denied.
- Task 3: a Write whose only break is added comment lines lands with those lines stripped; a nested ternary is still refused.
- Task 4: an Agent brief that names paths but lacks `Reads:` gets those paths as its `Reads:` line; a brief naming none is still refused.

## fast-task-gate
- `killTree` with `platform: 'win32'` calls its `run` stub with `taskkill` and `['/pid', '<pid>', '/T', '/F']`; on POSIX a detached shell's grandchild is gone after `killTree`; a timed-out verify Proof and gate still fail with `timed out after <n>s` (Task 2; seam: `tests/process-tree.test.mjs`, `tests/verify-gate.test.mjs`).
- `runTreeSync` past its deadline returns `timedOut: true` and a grandchild that would write a marker file after the deadline writes none; a passing command returns status 0 with stdout and stderr merged (Task 3; seam: `tests/process-tree.test.mjs`).
- `next-task.mjs --in-flight 2` prints `Start:` with only tasks disjoint from Task 2, within `WAVE_LIMIT`, and `Start: none` when the window is full (Task 6; seam: `tests/next-task.test.mjs`, `tests/plan-tasks.test.mjs`).

## lean-open-2
- Task 4: `END_STATES` holds two names and no code names the needs-input state.

## lean-open
- Task 1: the dead file, `repairOrBlock`, the `code rule` kind and the `no red proof` prompt line are gone and the tests pass.
- Task 4: `lib/guard-rules.mjs`, `lib/git-deny.mjs`, `skills/build/scripts/land-*.mjs` and `docs/plans/` outside Files are not in the commit and get the same warning.

## loop-budget-2
- `npm run check` fails a planted agent line telling a subagent to end its turn and wait for a child, a planted `setInterval` file poll outside `lib/loop-budget.mjs` and a planted `git worktree add ../x` outside `lib/checkout.mjs` (Task 4, Task 9, Task 16).
- A run started in a linked worktree opens its slots as flat siblings under `<main checkout>/.claude/worktrees/`, and a repo with no ignore rule gets `.claude/worktrees/` in `.git/info/exclude` with `git status` clean (Task 10, Task 12).

## loop-budget
- A fix round that does not lower the open count is reverted and prints `LOOP <kind> STOP no-progress` (Task 1, Task 5).
- One Agent dispatch that breaks three brief rules is refused once, naming all three; the third refusal of the same dispatch stops with `LOOP refusal STOP cap` (Task 2).
- look.mjs ends within its kinds-table wall timeout (Task 8).
- `node lib/loop-budget.mjs --report <run dir>` prints rounds, wall and cost per kind (Task 1, Task 7).

## brief
- `node --test tests/harness-capabilities.test.mjs` passes and fails when a matrix row and an adapter disagree (Task 1).

## small-items
- Task 4: a task brief from next-task carries the plan's Decisions.
