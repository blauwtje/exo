<!-- expect: Task 1 and Task 2 share no Depends on chain, but the plan's '## Plan basis' has no 'Worktree setup:' line: add 'Worktree setup: <command>' or 'Worktree setup: none' so they build together -->
<!-- repo: src/a.mjs, src/b.mjs -->
# Plan: independent tasks and no Worktree setup line

## Goal
The fixture shows one plan shape.

## Plan basis
Repository: ~/code/app
Branch: feat/fixture
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
### Task 1: feat(app): add a
Depends on: none | Files: `src/a.mjs` | Data: a plain object | Proof: node --test tests/fixture.test.mjs
### Task 2: feat(app): add b
Depends on: none | Files: `src/b.mjs` | Data: a plain object | Proof: node --test tests/fixture.test.mjs
