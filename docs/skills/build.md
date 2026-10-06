# build

Runs a plan, one task per fresh context. Without a plan, it builds a decided change in this session.

## When it runs

- A session opens on a plan, or you say to run or resume one.
- A decided change with no plan touches more than two files, adds a dependency, changes a public signature, or crosses a persisted format or security boundary.
- You ask for a change test-first, at any size.

Not for writing or repairing a plan, or a change of two files or fewer.

## What you get

- One commit per task, so a resumed run knows what landed.
- Independent tasks built in parallel in their own worktrees.
- Test-first work shows the failing test before the fix and the passing test after.
- A final report ending with the brief's `## Manual checks`, the checks only you can make.
- A handoff to `verify`. It picks the deep reviewer when a landed task carries a `Risk:` field, a manifest or lockfile changed or a public signature changed.

## Source

`skills/build/SKILL.md` and its `references/`.
