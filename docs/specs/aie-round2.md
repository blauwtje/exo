# aie-round2

## Verdict
Verdict: go
Objection: many round-2 ideas may already exist in exo, so each of the 30 was checked against the repo and dropped or merged with evidence in `.exo/aie-round2/spec-detail.md`.

## Goal
The round-2 ideas that the repo does not cover land as one skill-lint rule, one extension of the worker result shape, and two short prose lines for the branch reviewer and the task list.

## Decisions
1. Idea 13 (no automated rewriting of skill text from eval scores) wins over ideas 9, 22 and 24: exo adds no loop that patches skill text from scores, because the talk reports about 30 failed attempts and every skill change here already goes through a human-read pull request (exo decided).
2. The ritual-phrase idea becomes a rule in `verify/checks/skill-lint.mjs`, the family round 1 added, not a new check module (exo decided).
3. Number re-derivation, empty-output and partial-batch ideas share the worker result shape in `lib/agent-modes/task-modes.md`: a number or date in `Did` names the command that derived it from the source, and empty or partial output is `Status: unknown`, never `done` (exo decided).
4. The reviewer reads the git history of touched paths through one line in `agents/review-branch.md` (exo decided).
5. The pre-edit reference-listing idea is one line in `skills/spec/references/task-list.md` telling the spec to grep the renamed or changed name and cover the hits in `Files:`; no script, because `grep -rl` is the script (exo decided).
6. Cut for size: model-by-effort replay tables, ablation runs, train/test splits, scheduled session grading, tool-failure mining, handover replay, witness-file rollback. Each needs an eval or analytics harness with no small verifiable slice beyond `benchmarks/` (exo decided).

## Non-goals
- Eval harnesses and scheduled grading: `benchmarks/`.
- Hooks that block overwrites of approved text: `hooks/`.
- Anything round 1 decided: `docs/specs/aie-round1.md`.

## Assumptions
- code: `verify/checks/skill-lint.mjs` holds one function per rule and `verify/late-checks.mjs` registers it.
- code: `lib/agent-modes/task-modes.md:25` defines the result lines.
- code: `agents/review-branch.md` has a Bash tool and a `## Review` list.

## Acceptance
- Task 1: a fixture skill with "double check your work" is reported with rule `ritual` and a quoted mention is not; the repo is clean.
- Task 2: the mode file states the derivation and empty-output rules.
- Task 3: the reviewer line exists.
- Task 4: the task-list line exists.
- Success criterion: the full check.

## Manual checks

## Plan basis
Repository: /Users/thomash/Documents/Code/personal/plugins/exo
Branch: spec/aie-round2
Worktree setup: none
Land gate: npm run validate:static
Land: local
Commit: feat(aie): adopt round 2 ideas as a ritual lint rule, result-shape rules and two prose lines
Lint: none
App: none
Allow: none

## Success criterion
`npm run check`
Red: none (each task's Proof proves its own red)

## Checkpoint
- Blocks first: none.
- Parallel: Tasks 1, 2, 3 and 4.
- Shared state: none.
- Smallest safe split: one task per concern.

## Tasks
### Task 1: feat(verify): flag old-model ritual phrases in skill text
Depends on: none | Files: `verify/checks/skill-lint.mjs`, `tests/skill-lint.test.mjs`, `docs/behaviour/agents.md`, `docs/behaviour/lib.md`, `docs/behaviour/spec.md`, `docs/behaviour/verify.md` | Data: a `ritual` rule row `{ path, line, rule }` for the phrases double check, be maximally thorough, think step by step and think carefully, skipped when the phrase sits inside quotes | Proof: node --import ./tests/clean-run-env.mjs --test tests/skill-lint.test.mjs
### Task 2: feat(agents): derived numbers and empty output in the worker result shape
Depends on: none | Files: `lib/agent-modes/task-modes.md`, `tests/agents.test.mjs`, `tests/fixer-mark.test.mjs`, `tests/worker-waits.test.mjs` | Data: two bullets under `## Result shape` | Evidence: none (static prose, no eval run) | Proof: node --import ./tests/clean-run-env.mjs --test tests/agents.test.mjs tests/fixer-mark.test.mjs tests/worker-waits.test.mjs
### Task 3: docs(gate): the branch reviewer reads the history of touched paths
Depends on: none | Files: `agents/review-branch.md` | Data: one bullet under `## Review`, with other Review wording shortened so the body stays inside its 750-token cap | Evidence: none (static prose, no eval run) | Proof: grep -n 'git log' agents/review-branch.md
### Task 4: docs(spec): cover every reference to a changed name in Files
Depends on: none | Files: `skills/spec/references/task-list.md`, `verify/budgets.mjs`, `tests/verify-print.test.mjs`, `CONTRIBUTING.md` | Data: one bullet in the Files rules, with the task-list body cap in `verify/budgets.mjs` raised by the bullet's tokens | Evidence: none (static prose, no eval run) | Proof: grep -n 'grep -rl' skills/spec/references/task-list.md
