# build-change

Builds a decided change in this session, when the change is too large to make blind or you want it test-first.

## When it fires

The change is decided and inspection shows it modifies more than two source, test or config files, adds a dependency, changes a public signature, crosses a persisted format or a security boundary, or reaches a file nobody inspected. A change you ask for test-first, or a bug with a reproduction, fires it at any file count.

## What you get

- The change built, proven and reported in one pass, with one report at the end.
- For a test-first change: the observable boundaries confirmed, a failing test quoted before each production edit, then the least code that passes it.
- The migration, security and performance rules opened only when the change touches those boundaries.
- A critique of the result before it is called done, then the finish question `ship` asks.

## Where its rules live

`skills/build-change/SKILL.md`, with its `references/` holding the test, test-first, migration, security and performance rules every stage borrows.
