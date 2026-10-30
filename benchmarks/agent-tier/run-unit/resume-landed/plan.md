# add span, mean and summary

## Goal

Number statistics: the span of a list, its mean, and a summary of both.

## Plan basis

Repository: /path/to/repository
Branch: bench/resume-landed
Land: local
Commit: feat(stats): add span, mean and summary
Lint: none
Allow: none
Worktree setup: none
Land gate: npm test

Planned against the seed commit. Each task is a small module with its own test file.

## Success criterion

`node -e "import('./src/summary.mjs').then((m) => process.exit(typeof m.summary === 'function' ? 0 : 1))"`

## Non-goals

- No dependency is added.

## Context

- `npm test` runs `node --test tests/*.test.mjs`.

## Checkpoint

- Blocks first: none.
- Parallel: none
- Shared state: none.
- Smallest safe split: one task per module, chained by Depends on.

## Tasks

### Task 1: feat(span): add span
Depends on: none | Files: `src/span.mjs`, `tests/span.test.mjs` | Data: export `span(values)` from `src/span.mjs`: the largest value minus the smallest; add `tests/span.test.mjs` | Proof: node --test tests/span.test.mjs

### Task 2: feat(mean): add mean
Depends on: 1 | Files: `src/mean.mjs`, `tests/mean.test.mjs` | Data: export `mean(values)` from `src/mean.mjs`: the sum over the count, 0 for an empty list; add `tests/mean.test.mjs` | Proof: node --test tests/mean.test.mjs

### Task 3: feat(summary): add summary
Depends on: 2 | Files: `src/summary.mjs`, `tests/summary.test.mjs` | Data: export `summary(values)` from `src/summary.mjs`: `{ span, mean }` from `span` and `mean`; add `tests/summary.test.mjs` | Proof: node --test tests/summary.test.mjs

## Final verification

- `npm test` passes.
- Walkthrough: none, the module has no user-visible surface.
