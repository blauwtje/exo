<!-- expect: ok -->
<!-- repo: src/a.mjs -->
# Plan: a refactor task with Red none

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
Depends on: none | Files: `src/a.mjs` | Data: a plain object | Red: none (behavior stays the same) | Proof: node --test tests/a.test.mjs
