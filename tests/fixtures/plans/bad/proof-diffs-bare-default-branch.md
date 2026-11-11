<!-- expect: [WARN] Task 1: 'Proof: git diff main --stat' diffs against bare `main`, which moves when the default branch moves: use `$(git merge-base main HEAD)` as the base -->
<!-- repo: src/a.mjs -->
# Plan: a proof that diffs against the bare default branch

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
### Task 1: feat(app): change a
Depends on: none | Files: `src/a.mjs` | Data: a plain object | Proof: git diff main --stat
