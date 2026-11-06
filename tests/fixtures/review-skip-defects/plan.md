# Plan: parse config

## Goal
Add a config parser with a passing test.

## Plan basis
Repository: /tmp/review-skip-defects
Branch: feature
Land: local

## Success criterion
`node --test` passes.

## Checkpoint
- Blocks first: none.
- Parallel: none.
- Shared state: none.
- Smallest safe split: one task.

## Tasks

### Task 1: Add the config parser
Depends on: none | Files: `src/parse-config.mjs`, `tests/parse-config.test.mjs` | Data: a plain object | Proof: node --test
