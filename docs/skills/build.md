# build

Runs a plan, one task per fresh context. Without a plan, it builds a decided change in this session.

## When it runs

- A session opens on a plan, or you say to run or resume one.
- A decided change with no plan touches more than two files, adds a dependency, changes a public signature, or crosses a persisted format or security boundary.
- You ask for a change test-first, at any size.

Unattended, `exo run <plan>` from your terminal lands each task in its own headless process, then verifies.

Not for writing or repairing a plan, or a change of two files or fewer.

## What you get

- One commit per task, so a resumed run knows what landed.
- Independent tasks built in parallel in their own worktrees.
- Test-first work shows the failing test before the fix and the passing test after.
- A point the plan leaves open is parked, not guessed: after the wave lands you get one question per message, and that task is rebuilt with your answer.
- A short final message naming a run report that holds the proofs and the brief's `## Manual checks`, the checks only you can make.
- A line inviting changes in the same session, above `ship`'s route question when it asks one.
- A handoff to `verify`. It picks the deep reviewer when a landed task's `Risk:` field names a security boundary. A task that crosses a security boundary needs a `Risk:` field.

## Source

`skills/build/SKILL.md` and its `references/`.
