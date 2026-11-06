<!-- expect: the plan's '## Checkpoint' line 'Parallel: whichever order.' does not read 'none', 'every task' or task numbers such as 'Tasks 1, 2 and 3' -->
<!-- repo: src/a.mjs -->
# Plan: a Parallel line in no accepted form

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
- Parallel: whichever order.
- Shared state: none.
- Smallest safe split: one task per file.

## Tasks
### Task 1: feat(app): change a
Depends on: none | Files: `src/a.mjs` | Data: a plain object | Proof: node --test tests/fixture.test.mjs
