<!-- expect: [WARN] Task 1 and Task 2 both list Files: `src/a.mjs` with no Depends on chain between them -->
<!-- repo: src/a.mjs -->
# Plan: two parallel tasks list the same file

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
- Parallel: Tasks 1 and 2.
- Shared state: none.
- Smallest safe split: one task per file.

## Tasks
### Task 1: feat(app): change a
Depends on: none | Files: `src/a.mjs` | Data: a plain object | Proof: node --test tests/fixture.test.mjs
### Task 2: feat(app): change a again
Depends on: none | Files: `src/a.mjs` | Data: a plain object | Proof: node --test tests/fixture.test.mjs
