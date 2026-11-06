<!-- expect: Proof of Task 1: 'node --test a &gt; b' holds the HTML entity '&gt;', which the shell runs as written; write the plain character -->
<!-- repo: src/run.mjs -->
# Plan: html entity in a proof

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
### Task 1: feat(app): change the runner
Depends on: none | Files: `src/run.mjs` | Data: a plain object | Proof: node --test a &gt; b
