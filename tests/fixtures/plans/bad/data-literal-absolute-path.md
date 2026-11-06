<!-- expect: Task 1: Data: names `/etc/hosts`, a path the land check cannot search (absolute, outside the repository or git-ignored); name it relative to the repository, or add `Literals: none (<reason>)` -->
<!-- repo: src/a.mjs -->
# Plan: a Data literal outside the repository

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
Depends on: none | Files: `src/a.mjs` | Data: reads `/etc/hosts` as input | Proof: node --test tests/fixture.test.mjs
