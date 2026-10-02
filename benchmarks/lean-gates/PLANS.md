# lean-gates plans

`plans/old.md` and `plans/new.md` hold the same goal, success criterion, non-goals, context, checkpoint and five tasks. Each plan's basis is the default its own version's spec skill writes for this fixture, whose `package.json` has `test`, `typecheck` and `lint` scripts. Without that, the benchmark would measure the plan instead of the gates. Three lines differ.

## Lines that differ

- **`Land gate:`** Old has `npm test` and new has `npm run typecheck`.
  - Old: `skills/spec/references/task-list.md:14` says to add `Land gate: npm test` when the package has a `test` script. The example at `example-plan.md:15` matches, and `plan-check.mjs:224-225` enforces it.
  - New: `skills/spec/references/task-list.md:14` says to add `Land gate: npm run typecheck` when the package has a `typecheck` script. The example at `example-plan.md:15` matches, and `plan-check.mjs:226` enforces it.
- **`Lint: npx eslint`** is in new only.
  - New: `task-list.md:15` adds a `Lint:` line naming the linter binary when the package has a `lint` script. The example is at `example-plan.md:16`, and `plan-check.mjs:229` fails a plan without the line.
  - Old: neither `task-list.md` nor `lib/plan-tasks.mjs` knows the field, so old has no line.
- **`| Risk: public signature`** appears on Task 1 in new only. Task 1 adds a required `onDate` parameter to the exported `taxRate` and `computeTax`.
  - New: the template at `task-list.md:25` has an optional `Risk:` segment, and `task-list.md:32` defines `public signature` as one of its four categories. `plan-check.mjs:22,254` validates the value, and `verify.mjs:239` routes a landed Risk: task to `review-branch-deep`.
  - Old: the template at `task-list.md:26` has no `Risk:` field. Old has no counterpart, so its line stays unchanged.

## Shared lines that matter

- `Repository: @@REPO@@` and the `@@REPO@@` inside `Worktree setup:` are placeholders. The harness replaces them with the run's absolute repo path in both plans.
- Both plans use `Worktree setup: ln -s "@@REPO@@/node_modules" node_modules`. It runs offline and is identical in both. Wave worktrees go to sibling `<root>-task-<n>` folders (`skills/build/references/wave-worktrees.md:7`, the same in both versions), so each one needs `node_modules`.
- The success criterion reads `` `npm test` passes. ``. Both versions' `verify.mjs` take the gate command from it, which keeps verify off its fallback to `npm run check`.
- Each Proof is one narrow test file (`npm test -- tests/<file>.test.ts`), so neither version runs the full suite per task through a Proof.

## `diff plans/old.md plans/new.md`

```
10c10,11
< Land gate: npm test
---
> Land gate: npm run typecheck
> Lint: npx eslint
36c37
< Depends on: none | Files: `src/tax.ts`, `src/invoice.ts`, `tests/tax.test.ts` | Data: a per-region array of dated rate periods, each a `{ from, rates }` object | Proof: npm test -- tests/tax.test.ts
---
> Depends on: none | Files: `src/tax.ts`, `src/invoice.ts`, `tests/tax.test.ts` | Data: a per-region array of dated rate periods, each a `{ from, rates }` object | Risk: public signature | Proof: npm test -- tests/tax.test.ts
```

All rule paths above are relative to the plugin root of `.worktrees/bench-old` (d33adf37) or `.worktrees/bench-new` (a8b27a45).
