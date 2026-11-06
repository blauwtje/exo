<!-- expect: Task 1: 'Proof: npm run check' equals the 'Land gate:' command, so land will refuse it with "no red proof": name a Proof that fails before the task, or add 'Red: none (<reason>)' -->
<!-- repo: src/a.mjs -->
# Plan: a proof equal to the land gate

## Goal
The fixture shows one plan shape.

## Plan basis
Repository: ~/code/app
Branch: feat/fixture
Worktree setup: none
Land: local
Commit: feat(app): add the fixture
Land gate: npm run check

## Success criterion
`node --test` passes.

## Checkpoint
- Blocks first: none.
- Parallel: every task.
- Shared state: none.
- Smallest safe split: one task per file.

## Tasks
### Task 1: feat(app): change a
Depends on: none | Files: `src/a.mjs` | Data: a plain object | Proof: npm run check
