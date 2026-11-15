# Stacked pull requests

Goal: ship a plan branch as a chain of small pull requests, one per wave, and merge them in order.

## When

- Use it when the plan has two or more waves and the user asks for a stack.
- It is opt-in. Without the ask, ship the branch as one pull request.
- Run `gate` once on the tip first, because each wave already passed its task's land gate.

## Commands

- Build the chain: `stack.mjs --plan <plan.md> --body <file>`.
- Repair the chain after a squash merge: `stack.mjs --restack`.

## Choices

- One pull request per wave, not per task; gate each only inside `--merge`.
- Sync a child to the default branch with a merge commit and retarget it, never a rebase or force push.

## Merging

- Merge the stack in order with `ship.mjs --merge <all>`; a conflicting child stops the restack for conflict resolution.
