<!-- expect: Task 1: the Files are all tests and the task has no 'Red:' field, so its Proof passes before the change and land will refuse it with "no red proof": add a source file to Files, or add 'Red: none (<reason>)' -->
<!-- repo: tests/a.test.mjs -->
# Plan: a task whose Files are all tests and has no Red

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
### Task 1: test(app): cover a
Depends on: none | Files: `tests/a.test.mjs` | Data: a plain object | Proof: node --test tests/a.test.mjs
