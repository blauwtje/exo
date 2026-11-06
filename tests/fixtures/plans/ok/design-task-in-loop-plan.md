<!-- expect: ok -->
<!-- repo: src/app.js -->
<!-- flags: --loop -->
# Plan: a Design task in a loop plan

## Goal
The fixture shows one plan shape.

## Plan basis
Repository: ~/code/app
Branch: feat/fixture
Worktree setup: none
Land: local
Commit: feat(app): add the fixture
Allow: none

## Success criterion
`node --test` passes.

## Checkpoint
- Blocks first: none.
- Parallel: every task.
- Shared state: none.
- Smallest safe split: one task per file.

## Visual direction
Quiet record.

## Tasks
### Task 1: feat(app): greet
Depends on: none | Files: `src/app.js` | Data: a plain object | Design: design-ui | Proof: node --test tests/app.test.mjs
