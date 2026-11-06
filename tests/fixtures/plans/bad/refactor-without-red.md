<!-- expect: Task 1: a refactor task has no 'Red:' field, so land will refuse a Proof that passes before the change with "no red proof": add 'Red: none (<reason>)'; a Proof that fails before the change marks a behavior change, so give the heading type feat or fix instead -->
<!-- repo: src/a.mjs -->
# Plan: a refactor task with no Red field

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
### Task 1: refactor(app): split a
Depends on: none | Files: `src/a.mjs` | Data: a plain object | Proof: node --test tests/a.test.mjs
