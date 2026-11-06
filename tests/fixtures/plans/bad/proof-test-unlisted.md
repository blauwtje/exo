<!-- expect: Task 1: add `tests/a.test.mjs` to Files: (its Proof runs it) -->
<!-- repo: src/b.mjs, tests/a.test.mjs -->
# Plan: a proof test listed by no task in the chain

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
### Task 1: feat(app): add b
Depends on: none | Files: `src/b.mjs` | Data: a plain object | Proof: node --test tests/a.test.mjs
