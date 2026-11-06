<!-- expect: ok -->
<!-- repo: src/run.mjs -->
# Plan: first backticked command is the product run

## Goal
The fixture shows one plan shape.

## Plan basis
Repository: ~/code/app
Branch: feat/fixture
Worktree setup: none
Land: local
Commit: feat(app): add the fixture
Land gate: npm run typecheck

## Success criterion
`npm test` passes and `npm run typecheck` stays green.
Red: none (each task proves its own red)

## Checkpoint
- Blocks first: none.
- Parallel: every task.
- Shared state: none.
- Smallest safe split: one task per file.

## Tasks
### Task 1: feat(app): change the runner
Depends on: none | Files: `src/run.mjs` | Data: a plain object | Proof: node --test tests/run.test.mjs
