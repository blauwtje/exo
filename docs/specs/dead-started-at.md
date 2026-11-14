## Goal
`land-run.mjs` no longer asks for a start time it never reads.

## Verdict
Verdict: go
Objection: none; the option lost its only reader when the branch-review file check left `land-run.mjs`.

## Decisions
1. Remove the `--started-at` option and the `startedAt` field from `skills/build/scripts/land-run.mjs`, from its caller `skills/build/scripts/run-land-stage.mjs` and from `tests/land-run.test.mjs`. The run state's own `startedAt` in `run-state.mjs`, `run-plan.mjs` and `hooks/run-watch.mjs` stays, because the run watch reads it. (exo decided)

## Non-goals
- Any other change to the landing steps or to the run state.

## Assumptions
- [code] `git grep -n "started-at"` names only `skills/build/scripts/land-run.mjs` and `tests/land-run.test.mjs`.

## Acceptance
- Task 1: `skills/build/scripts/land-run.mjs` names no `started-at` and no `startedAt`, and `tests/land-run.test.mjs` passes without passing one.

## Manual checks
- none

## Plan basis
Repository: .
Branch: dead-started-at
Worktree setup: none
Land gate: npm run validate:static
Land: local
Commit: fix(build): stop requiring an unused start time in the landing script
Lint: none
App: none
Allow: none

## Success criterion
`npm run check`
Red: none (the task's Proof proves its own red)
Product run: none (the plugin has no bin or start script)

## Checkpoint
- Blocks first: Task 1.
- Parallel: none.
- Shared state: none.
- Smallest safe split: one task, because the option, its caller and its test change together.

## Tasks
### Task 1: fix(build): stop requiring an unused start time in the landing script
Depends on: none | Files: `skills/build/scripts/land-run.mjs`, `skills/build/scripts/run-land-stage.mjs`, `tests/land-run.test.mjs`, `verify/module-size-ceilings.txt`, `docs/behaviour/build.md`, `docs/behaviour/gate.md` | Proof: `! grep -q 'started-at\|startedAt' skills/build/scripts/land-run.mjs && node --test tests/land-run.test.mjs`
- Delete the `--started-at` option from the usage text, the option table, the required list and the returned options of `skills/build/scripts/land-run.mjs`, and the `startedAt` parameter where `landSteps` still names it.
- Delete `startedAt: state.startedAt` from the options `skills/build/scripts/run-land-stage.mjs` passes.
- Delete the `startedAt` value and the `--started-at` argument from `tests/land-run.test.mjs`.
