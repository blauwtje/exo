<!-- expect: ok -->
<!-- repo: src/widget.mjs, tests/widget.test.mjs, tests/widget-extra.test.mjs -->
# Plan: one listed test per source file

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
### Task 1: feat(app): change the widget
Depends on: none | Files: `src/widget.mjs`, `tests/widget.test.mjs` | Data: a plain object | Proof: node --test tests/widget.test.mjs
