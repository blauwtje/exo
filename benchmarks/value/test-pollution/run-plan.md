# Order-independent tests

## Goal

The seed's test suite passes in any file order: no module under `src/` keeps state that one tenant's call leaves for another's, and the tests stay as they are.

## Plan basis

Repository: /path/to/repository
Branch: bench/test-pollution
Land: local
Lint: none
Allow: none
Worktree setup: none
Land gate: node --check src/index.mjs

Planned against the seed commit. `npm test` runs `node --test --test-isolation=none tests/*.test.mjs`, so every test file shares one process and one module cache. Executor loads the `build` skill on this plan before the first task.

## Success criterion

`node --test --test-isolation=none tests/tax.test.mjs tests/router.test.mjs tests/quotes.test.mjs tests/pricing.test.mjs tests/options.test.mjs tests/invoices.test.mjs tests/fx.test.mjs tests/discounts.test.mjs tests/credit-notes.test.mjs tests/catalog.test.mjs tests/audit.test.mjs && node --test --test-isolation=none tests/options.test.mjs tests/pricing.test.mjs tests/quotes.test.mjs tests/router.test.mjs tests/tax.test.mjs tests/audit.test.mjs tests/catalog.test.mjs tests/credit-notes.test.mjs tests/discounts.test.mjs tests/fx.test.mjs tests/invoices.test.mjs`
Repeat: 3 (order-dependent state)

## Non-goals

- Files under `tests/` stay unchanged.
- No dependency is added and no test runner option is changed.

## Context

- The suite passes file by file and fails when files share one process, so some module under `src/` keeps state across tenants; find every such module, not only the one the failing test names.

## Checkpoint

- Blocks first: none.
- Parallel: none
- Shared state: none.
- Smallest safe split: one task fixes the order-dependent state in the non-test files.

## Tasks

### Task 1: fix(src): remove the order-dependent state
Depends on: none | Files: `src` | Data: every module-level cache or setting that one tenant's call leaves for the next becomes per-tenant or per-call state; no test file changes | Proof: node --test --test-isolation=none tests/tax.test.mjs tests/router.test.mjs tests/quotes.test.mjs tests/pricing.test.mjs tests/options.test.mjs tests/invoices.test.mjs tests/fx.test.mjs tests/discounts.test.mjs tests/credit-notes.test.mjs tests/catalog.test.mjs tests/audit.test.mjs

## Final verification

- The Success criterion command passes, `fail 0` in both orders.
- Walkthrough: none, the service has no user-visible surface.
