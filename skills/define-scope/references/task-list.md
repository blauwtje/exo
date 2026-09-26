# Specification of the task list

The task list closing a brief names the goal, the basis, the proof and one
line per task, nothing more. The enemy is a task whose file or shape stays implicit, forcing
the builder to guess it from prose. The overcorrection is spelling out every
step's code, which the compact grammar leaves to each task's own builder.
`node <skill>/scripts/plan-check.mjs --plan <path>`, where `<skill>` is the
define-scope folder holding this file, enforces every rule below; run it
before ending the turn and repair each line it prints.

Write for a reader with zero conversation context: no "as discussed", no
reference back to the request. A fact the planning session could not settle
is asked before the plan is written; a choice the user would not notice is
made in the plan, in a task's `Data:` field or its heading.

## Header sections, in order

1. `## Goal`: one sentence naming the observable result.
2. `## Plan basis`: `Repository: <absolute root>` and `Branch: <branch>` on their own lines, so `run-plan` matches this plan to a checkout; for a folder that is not a git repository yet, `Repository:` still names it, `Branch:` reads `main`, and the executor runs `git init -b main` there before the first task, never an init step for the owner. Once two tasks share no `Depends on:` chain between them, directly or through another task, the basis adds a third line, `Worktree setup: <command>` or `Worktree setup: none`, naming the command a fresh worktree needs before it can build either task, such as a dependency install; without the line the run builds one task at a time.
3. `## Success criterion`: the one command that proves every task landed; a
   cheap model reruns it, so it names no interpretation step and no check only
   the user can make, which goes to the brief's `## Manual checks` instead.
4. `## Checkpoint`: four literal points read as one paragraph or list:
   `Blocks first:` the task every other task needs, or `none`; `Parallel:`
   which tasks need no earlier one; `Shared state:` the file, key or branch
   more than one task touches, or `none`; `Smallest safe split:` the
   narrowest unit a delegate can build alone, such as one task per file.
5. `## Tasks`: the dependency-ordered list in the template below.

## The task template

```
### Task <n>: <type>(<scope>): <subject>

Depends on: none | <n>[, <n>] | Files: `<path>`[, `<path>`] | Data: <structure, one clause>[ | Design: <skill name>] | Proof: <one bare command>
```

The heading is the exact conventional-commit subject `land-task` commits with,
trailed by `Plan-task: <n>`; it stages the `Files:` paths itself, so the plan
never repeats a `Commit:` block. `Data:` names the structure the task's code
holds its result in (a plain object, a `Map` keyed by id, an array of rows) in
one clause, not its fields or algorithm. `Design:` names the skill a task
loads before its first edit, only on a task that changes what a page looks
like; every other task omits the segment entirely. `Proof:` names the one
bare command, no interpretation step, that shows this task alone landed; a
cheap model runs it in place of the plan's `## Success criterion`.

## Rules

1. **Verified names only.** List a path only after reading it in this
   repository during planning; `plan-check` catches a missing `Modify:` path,
   not a wrong one that still exists.
2. **One field line, one task.** A task with a second field line, a `Run:`,
   an `Expected:` line or a shown code block is not compact, and `plan-check`
   checks it as a long-format task instead, which then needs a `Commit:`
   block, `Run:` and `Expected:` lines.
3. **Small tasks.** A task lands in one delegate context: one heading names
   one concern, split further only when `Files:` would otherwise span both a
   shared write target (rule 4) and an independent one.
4. **Shared write target.** Split a file, key or branch two tasks would both
   touch, unless a real shared invariant earns the `Depends on:` edge that
   serializes them; `plan-check` catches an unsplit share with no such chain.
5. **No manual task.** A check only the user can make is one `## Manual
   checks` line, never a task, because no builder lands it and the run stalls.

## Judgment

- Verified repository evidence outranks a remembered symbol or a generic
  pattern.
- An explicit user decision outranks an inferred one; ask before writing
  rather than leaving it to the executor.
- A `Data:` choice that changes a public signature or a persisted format is a
  decision the user would notice: ask, do not infer it silently.
