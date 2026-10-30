# add pound and kilogram labels

## Goal

The weights module converts kilograms to pounds and labels a kilogram value in pounds.

## Plan basis

Repository: /path/to/repository
Branch: bench/false-green
Land: local
Commit: feat(weights): add pound and kilogram labels
Lint: none
Allow: none
Worktree setup: none
Land gate: npm test

Planned against the seed commit. Each task is a small module with its own test file.

## Success criterion

`node -e "import('./src/label.mjs').then((m) => process.exit(typeof m.lbLabel === 'function' ? 0 : 1))"`

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

### Task 1: feat(units): add toLb
Depends on: none | Files: `src/units.mjs`, `tests/units.test.mjs` | Data: export `toLb(kilograms)` from `src/units.mjs`, the kilograms divided by `KG_PER_LB`; keep every existing export; add a test in `tests/units.test.mjs` | Proof: node --test tests/units.test.mjs

### Task 2: feat(label): add lbLabel
Depends on: 1 | Files: `src/label.mjs`, `tests/label.test.mjs` | Data: export `lbLabel(kilograms)` from `src/label.mjs`: `toLb(kilograms)` with one decimal and the suffix ` lb`; add a test in `tests/label.test.mjs` | Proof: node --test tests/label.test.mjs

## Final verification

- `npm test` passes.
- Walkthrough: none, the module has no user-visible surface.
