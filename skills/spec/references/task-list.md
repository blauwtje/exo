# Specification of the task list

The task list names the goal, the basis, the proof and one
line per task, with no implicit file or shape and no step's code. `node
<skill>/scripts/plan-check.mjs --plan <path>` enforces every rule below; run
it before the turn ends and repair each line.

Write for a zero-context reader: ask a fact planning could not settle;
a choice the user would not notice goes in `Data:` or the heading.

## Header sections, in order

1. `## Goal`: one sentence naming the result.
2. `## Plan basis`: `Repository: <absolute root>` and `Branch: <branch>`; with no git repo yet, `Branch:` reads `main` and the executor runs `git init -b main` there before the first task, never an init step for the owner. When two tasks share no `Depends on:` chain, the basis adds `Worktree setup: <command>` or `Worktree setup: none`; without the line the run builds one task at a time. The basis adds `Land gate: npm run validate` for root's package.json `validate` script, else `npm run check` for `check`, else `none`.
3. `## Success criterion`: the one command proving every task landed, no
   interpretation step, no user-only check (`## Manual checks`).
4. `## Checkpoint`: `Blocks first:`, `Parallel:`, `Shared state:`,
   `Smallest safe split:`, each naming tasks or `none`.
5. `## Tasks`: the dependency-ordered list.

## The task template

```
### Task <n>: <type>(<scope>): <subject>

Depends on: none | <n>[, <n>] | Files: `<path>`[, `<path>`] | Data: <structure, one clause>[ | Design: <skill name>] | Proof: <one bare command>
```

The heading is the conventional-commit subject `land-task` commits with,
trailed by `Plan-task: <plan-id>/<n>`, the plan id its file name without `.md`; it stages `Files:`, so no `Commit:` block. `Data:` names the structure the result lives in (an object, a
keyed `Map`, an array), not its fields or algorithm. `Design:` names the skill
a task loads first, only when it changes a page's look.
`Proof:` is the one bare command showing this task alone landed. A task whose
result runs (CLI, server, page, script) takes a `Proof:` running that
artifact on the project's real input, never a test alone: the project's own
command when one exists, else a script path the builder writes with only the
project's tools.

## Rules

1. **Verified names only.** List a path or symbol only after reading its
   range; `plan-check` catches a missing path, not a wrong one.
2. **One field line, one task.** A second field line, `Run:`, `Expected:` or
   a code block makes it long-format, needing `Commit:`, `Run:`, `Expected:`.
3. **Small tasks.** One heading, one concern; split only when `Files:` spans
   a shared write target (rule 4) and an independent one.
4. **Shared write target.** Split a file, key or branch two tasks both
   touch, unless a shared invariant earns a serializing `Depends on:` edge.
5. **No manual task.** A user-only check is one `## Manual checks` line.

## Judgment

- Verified repository evidence outranks a remembered symbol.
- An explicit user decision outranks an inferred one.
- A `Data:` choice changing a public signature or persisted format: ask.
