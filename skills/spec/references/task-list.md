# Specification of the task list

Write for a zero-context reader: no implicit file, shape or step. `plan-check` enforces the rules below.

## Header sections, in order

1. `## Goal`: one sentence naming the result.
2. `## Plan basis`: `Repository: <absolute root>` and `Branch: <branch>`; with no repo yet, `Branch: main` and the executor runs `git init -b main` there before the first task, never an init step for the owner.
   - Two tasks share no `Depends on:` chain → add `Worktree setup: <command>` or `Worktree setup: none`; without the line the run builds one task at a time.
   - Root package.json has a `typecheck` script → `Land gate: npm run typecheck`, else `none`; the owner may name a slower `validate` or `check`.
   - Root package.json has a `lint` script → `Lint: <linter binary>`, else `none`; `npm run lint` skips a task's `Files:`.
   - `Allow:` → each backticked command a task runs that no other field names, comma-separated, else `none`.
3. `## Success criterion`: one backticked command proving every task landed; no interpretation or user-only check.
4. `## Checkpoint`: `Blocks first:`, `Parallel:`, `Shared state:`, `Smallest safe split:`, each naming tasks, a shared target or `none`.
5. `## Tasks`, dependency-ordered.

## The task template

```
### Task <n>: <type>(<scope>): <subject>

Depends on: none | <n>[, <n>] | Files: `<path>`[, `<path>`] | Data: <structure, one clause>[ | Design: <skill name>][ | Risk: <category>] | Proof: <one bare command>
```

- `Files:` path ending in `/` → covers its whole folder.
- `Proof:` → one bare command showing this task alone landed, not the whole suite.
- A task whose result runs → prove it on the project's real input with its own command, else a builder's script using only its tools, never a test alone.
- MCP `Proof:` or Success criterion → `mcp:<tool> <args>`, `<tool>` after `mcp__<server>__`; the session calls it, not a shell.
- `Data:` → the structure holding the result, not its fields or logic; ask before one changing a public signature or persisted format.
- `Risk:` → marks a task on a `security boundary`, `persisted format`, `public signature` or `dependency`.
- Heading → `land-task`'s conventional-commit subject.
- The task stages `Files:`; no `Commit:` block.
- `Design:` → skill a task loads first, only for a page's look.

## Rules

1. **Verified names only.** List a path or symbol only after reading its range; `plan-check` catches only a missing one.
2. **One field line, one task.** A second field line, `Run:`, `Expected:` or a code block makes it long-format: `Commit:`, `Run:`, `Expected:` required.
3. **Small tasks.** One heading, one concern; split only when `Files:` spans a shared write target (rule 4) and an independent one.
4. **Shared write target.** File, key or branch two tasks touch → split, unless a shared invariant earns a `Depends on:` edge.
5. **No manual task.** User-only check → one `## Manual checks` line.
