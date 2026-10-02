# Specification of the task list

The task list names the goal, basis, proof and one
line per task, with no implicit file or shape and no step's code. `plan-check`
enforces every rule below.

Write for a zero-context reader.

## Header sections, in order

1. `## Goal`: one sentence naming the result.
2. `## Plan basis`: `Repository: <absolute root>` and `Branch: <branch>`; with no repo yet, `Branch:` reads `main` and the executor runs `git init -b main` there before the first task, never an init step for the owner.
   - When two tasks share no `Depends on:` chain, add `Worktree setup: <command>` or `Worktree setup: none`; without the line the run builds one task at a time.
   - Add `Land gate: npm run typecheck` for root's package.json `typecheck` script, else `none`; the owner may name a slower `validate` or `check`.
   - Add `Lint: <linter binary>` like `npx eslint` for root's package.json `lint` script, else `none`; `npm run lint` skips a task's `Files:`.
3. `## Success criterion`: the one command proving every task landed, no interpretation step, no user-only check.
4. `## Checkpoint`: `Blocks first:`, `Parallel:`, `Shared state:`, `Smallest safe split:`, each naming tasks, a shared target or `none`.
5. `## Tasks`: the dependency-ordered list.

## The task template

```
### Task <n>: <type>(<scope>): <subject>

Depends on: none | <n>[, <n>] | Files: `<path>`[, `<path>`] | Data: <structure, one clause>[ | Design: <skill name>][ | Risk: <category>] | Proof: <one bare command>
```

- A task whose result runs takes a `Proof:` running that artifact on the project's real input, never a test alone.
- That `Proof:` is the project's own command when one exists, else a script the builder writes with only the project's tools.
- `Proof:` is the one bare command showing this task alone landed.
- `Proof:` never runs the whole suite, such as `npm test`: name one test file or a script, because a build subagent's guard refuses a whole-suite run; the `## Success criterion` may still be `npm test`, which verify runs in the main session.
- `Data:` names the structure holding the result, not its fields or algorithm.
- `Risk:` marks a task touching a `security boundary`, `persisted format`, `public signature` or `dependency`; a task touching none omits it.
- The heading is `land-task`'s conventional-commit subject, trailed by `Plan-task: <plan-stem>/<n>`.
- The task stages `Files:` and carries no `Commit:` block.
- `Design:` names the skill a task loads first, only when it changes a page's look.

## Rules

1. **Verified names only.** List a path or symbol only after reading its range; `plan-check` catches only a missing one.
2. **One field line, one task.** A second field line, `Run:`, `Expected:` or a code block makes it long-format, needing `Commit:`, `Run:`, `Expected:`.
3. **Small tasks.** One heading, one concern; split only when `Files:` spans a shared write target (rule 4) and an independent one.
4. **Shared write target.** Split a file, key or branch two tasks both touch, unless a shared invariant earns a serializing `Depends on:` edge.
5. **No manual task.** A user-only check is one `## Manual checks` line.

## Judgment

- A `Data:` choice changing a public signature or persisted format: ask.
