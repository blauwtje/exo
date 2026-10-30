# add a text progress bar

## Goal

A text progress bar: clamp a value, turn a part of a total into a percentage, draw the bar.

## Plan basis

Repository: /path/to/repository
Branch: bench/ordered-three
Land: local
Commit: feat(bar): add a text progress bar
Lint: none
Allow: none
Worktree setup: none
Land gate: npm test

Planned against the seed commit. Each task is a small module with its own test file.

## Success criterion

`node -e "import('./src/bar.mjs').then((m) => process.exit(typeof m.bar === 'function' ? 0 : 1))"`

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

### Task 1: feat(clamp): add clamp
Depends on: none | Files: `src/clamp.mjs`, `tests/clamp.test.mjs` | Data: export `clamp(value, min, max)` from `src/clamp.mjs`; add `tests/clamp.test.mjs` | Proof: node --test tests/clamp.test.mjs

### Task 2: feat(percent): add percent
Depends on: 1 | Files: `src/percent.mjs`, `tests/percent.test.mjs` | Data: export `percent(part, total)` from `src/percent.mjs`: the whole-number percentage of `part` in `total`, clamped to 0..100 with `clamp`, 0 when `total` is 0; add `tests/percent.test.mjs` | Proof: node --test tests/percent.test.mjs

### Task 3: feat(bar): add bar
Depends on: 2 | Files: `src/bar.mjs`, `tests/bar.test.mjs` | Data: export `bar(part, total, width)` from `src/bar.mjs`: `#` times the filled cells by `percent`, `-` for the rest, `width` characters in all; add `tests/bar.test.mjs` | Proof: node --test tests/bar.test.mjs

## Final verification

- `npm test` passes.
- Walkthrough: none, the module has no user-visible surface.
