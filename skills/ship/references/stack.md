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

- One pull request per wave, not per task, because each pull request costs one CI run and one review.
- Gate once on the tip, and per pull request only inside `--merge`.
- Sync a child to the default branch with a merge commit and retarget it, never a rebase or force push.

## Merging

- Merge the stack in order with `ship.mjs --merge <all>`. Each merge restacks its children before the next one.
- When a child conflicts, the restack stops on that pull request and leaves it for conflict resolution.
