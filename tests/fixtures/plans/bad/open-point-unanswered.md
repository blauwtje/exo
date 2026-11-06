<!-- expect: the plan's '## Open points' still holds an unanswered question: Which date format does the badge use? -->
<!-- repo: src/a.mjs -->
# Plan: an Open points question left unanswered

## Goal
The fixture shows one plan shape.

## Plan basis
Repository: ~/code/app
Branch: feat/fixture
Worktree setup: none
Land: local
Commit: feat(app): add the fixture

## Success criterion
`node --test` passes.

## Checkpoint
- Blocks first: none.
- Parallel: every task.
- Shared state: none.
- Smallest safe split: one task per file.

## Tasks
### Task 1: feat(app): change a
Depends on: none | Files: `src/a.mjs` | Data: a plain object | Proof: node --test tests/fixture.test.mjs

## Open points
- Which date format does the badge use?
