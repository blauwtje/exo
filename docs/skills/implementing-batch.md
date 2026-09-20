# implementing-batch

Builds a decided change in this session, when the change is too large to make blind.

## When it fires

The change is decided and inspection shows it modifies more than two source, test or config files, adds a dependency, changes a public signature, crosses a persisted format or a security boundary, or reaches a file nobody inspected. A whole plan can also be built here in one window.

## What you get

- The change built, proven and reported in one pass, with one report at the end.
- The migration, security and performance rules opened only when the change touches those boundaries.
- A critique of the result before it is called done.

## Where its rules live

`skills/implementing-batch/SKILL.md`, with its `references/` holding the test, migration, security and performance rules every stage borrows.
