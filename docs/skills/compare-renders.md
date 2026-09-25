# compare-renders

Proves that a refactor, migration or dependency bump changes nothing visible, by diffing each rendered surface pixel for pixel against a baseline captured before the first edit.

## When it fires

Only when you invoke it; the model never loads it on its own. Use it when a styling or framework migration, a component refactor or a dependency bump must leave every rendered surface identical. A change meant to look different belongs to design-ui, and a behavior-preserving change with no rendered surface to refactor.

## What you get

- A baseline captured from the base commit before any edit, checked for stability by capturing it twice, then frozen: neither the baseline nor the capture harness is edited afterwards.
- Shared primitives migrated first, then one component at a time, each diffed before the next begins.
- An exact comparison by `scripts/pixel-diff.mjs`: any differing pixel or size change fails, and the loop returns to the code until the count is zero or you accept a named difference.
- A report naming every component with its diff lines, the baseline directory and commit, each accepted difference with its count and region, and what is left uncaptured or unmigrated.

## Where its rules live

`skills/compare-renders/SKILL.md`, with `references/capture-harness.md` and `scripts/pixel-diff.mjs`; captures reuse `skills/design-ui/scripts/capture.mjs` and `checkpoint.mjs`.
