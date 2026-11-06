<!-- expect: ok -->
<!-- repo: benchmarks/big.mjs, tests/keep.txt, CONTRIBUTING.md -->
# Plan: a later chained task lists the lock doc

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
- Parallel: none.
- Shared state: none.
- Smallest safe split: one task per file.

## Tasks
### Task 1: feat(bench): change the runner
Depends on: none | Files: `benchmarks/big.mjs` | Data: a plain object | Proof: node --test tests/fixture.test.mjs
### Task 2: docs(bench): document it
Depends on: 1 | Files: `CONTRIBUTING.md` | Data: a plain object | Proof: node --test tests/fixture.test.mjs
