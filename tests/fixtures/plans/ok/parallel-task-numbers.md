<!-- expect: ok -->
<!-- repo: src/a.mjs, src/b.mjs, src/c.mjs -->
# Plan: a Parallel line of task numbers

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
- Parallel: Tasks 1, 2 and 3.
- Shared state: none.
- Smallest safe split: one task per file.

## Tasks
### Task 1: feat(app): add a
Depends on: none | Files: `src/a.mjs` | Data: a plain object | Proof: node --test tests/fixture.test.mjs
### Task 2: feat(app): add b
Depends on: none | Files: `src/b.mjs` | Data: a plain object | Proof: node --test tests/fixture.test.mjs
### Task 3: feat(app): add c
Depends on: none | Files: `src/c.mjs` | Data: a plain object | Proof: node --test tests/fixture.test.mjs
