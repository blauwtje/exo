<!-- expect: ok -->
<!-- repo: src/a.mjs, src/b.mjs, tests/a.test.mjs -->
# Plan: a proof test listed by a task in the Depends on chain

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
- Parallel: none.
- Shared state: none.
- Smallest safe split: one task per file.

## Tasks
### Task 1: feat(app): add a
Depends on: none | Files: `src/a.mjs`, `tests/a.test.mjs` | Data: a plain object | Proof: node --test tests/a.test.mjs
### Task 2: feat(app): add b
Depends on: 1 | Files: `src/b.mjs` | Data: a plain object | Proof: node --test tests/a.test.mjs
