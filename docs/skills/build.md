# build

Runs a plan file, one task per fresh context, or, with no plan file, builds a decided change in this session.

## When it fires

A session opens on a plan to run, or you say to run or resume one. It does not author or repair a plan.

With no plan file, it fires when the change is decided and inspection shows it modifies more than two source, test or config files, adds a dependency, changes a public signature, crosses a persisted format or a security boundary, or reaches a file nobody inspected. A change you ask for test-first, or a bug with a reproduction, fires it at any file count.

## What you get

- One commit per task, carrying the task number, so a resumed session knows what has landed.
- Independent tasks built together in worktrees of their own; a plan of three tasks or fewer built in the session instead.
- One branch review at the end, against the plan and the written code standard: at `medium` effort on a branch of at most five changed files and 200 changed lines, at `high` above either number.
- A final report that ends with the brief's `## Manual checks`, the checks only you can make, listed once.
- The finish question `ship` asks, whose pick is carried out to its end.

With no plan file:

- The change built, proven and reported in one pass, with one report at the end.
- For a test-first change: the observable boundaries confirmed, a failing test quoted before each production edit, then the least code that passes it.
- The migration, security and performance rules opened only when the change touches those boundaries.
- A critique of the result before it is called done, then the finish question `ship` asks.

## Where its rules live

`skills/build/SKILL.md`, with the delegate prompts and its `references/` beside it, including the test, test-first, migration, security and performance rules the `## No spec` section borrows.
