# Specification of the task list

The task list closing a brief names the goal, the basis, the proof and one
line per task, nothing more: no implicit file or shape, no step's code
spelled out either, since the compact grammar leaves that to each builder.
`node <skill>/scripts/plan-check.mjs --plan <path>` enforces every rule
below; run it before ending the turn and repair each line it prints.

Write for a reader with zero context. A fact planning could not settle is
asked before the plan is written; a choice the user would not notice is made
in the plan, in a task's `Data:` field or heading.

## Header sections, in order

1. `## Goal`: one sentence naming the result.
2. `## Plan basis`: `Repository: <absolute root>` and `Branch: <branch>`; for a folder not yet a git repository, `Branch:` reads `main` and the executor runs `git init -b main` there before the first task, never an init step for the owner. When two tasks share no `Depends on:` chain, the basis adds `Worktree setup: <command>` or `Worktree setup: none`; without the line the run builds one task at a time.
3. `## Success criterion`: the one command proving every task landed, no
   interpretation step, no user-only check (that goes to `## Manual checks`).
4. `## Checkpoint`: `Blocks first:`, `Parallel:`, `Shared state:`,
   `Smallest safe split:`, each naming tasks or `none`.
5. `## Tasks`: the dependency-ordered list below.

## The task template

```
### Task <n>: <type>(<scope>): <subject>

Depends on: none | <n>[, <n>] | Files: `<path>`[, `<path>`] | Data: <structure, one clause>[ | Design: <skill name>] | Proof: <one bare command>
```

The heading is the conventional-commit subject `land-task` commits with,
trailed by `Plan-task: <n>`; it stages `Files:` itself, so no `Commit:`
block repeats. `Data:` names the structure the result lives in (a plain
object, a keyed `Map`, an array), not its fields or algorithm. `Design:`
names the skill a task loads first, only when it changes a page's look.
`Proof:` is the one bare command showing this task alone landed.

## Rules

1. **Verified names only.** List a path or symbol only after reading its
   range; `plan-check` catches a missing path, not a wrong one.
2. **One field line, one task.** A second field line, `Run:`, `Expected:` or
   a code block is long-format instead, needing `Commit:`, `Run:` and
   `Expected:` lines.
3. **Small tasks.** One heading, one concern; split further only when
   `Files:` spans a shared write target (rule 4) and an independent one.
4. **Shared write target.** Split a file, key or branch two tasks both
   touch, unless a shared invariant earns the `Depends on:` edge that
   serializes.
5. **No manual task.** A user-only check is one `## Manual checks` line,
   never a task.

## Judgment

- Verified repository evidence outranks a remembered symbol or pattern.
- An explicit user decision outranks an inferred one; ask before writing.
- A `Data:` choice changing a public signature or persisted format: ask.
