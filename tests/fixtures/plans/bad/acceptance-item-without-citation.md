<!-- expect: [WARN] the plan's '## Acceptance' item "The badge looks right to the reader" names no task number, 'Data:' segment, Success criterion or Manual checks line -->
<!-- repo: src/a.mjs -->
# Plan: an Acceptance item that cites no task

## Goal
The fixture shows one plan shape.

## Acceptance
- The badge looks right to the reader

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
Depends on: none | Files: `src/a.mjs` | Data: a plain object | Proof: node --test tests/fixture.test.mjs
