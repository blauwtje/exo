# The task list

## Sections, in order

1. `## Goal`: one sentence naming the result.
2. `## Plan basis`: `Repository: <absolute root>` and `Branch: <branch>`; no repo yet → `Branch: main` and the executor runs `git init -b main` there before the first task, never an init step for the owner.
   - Two tasks share no `Depends on:` chain → `Worktree setup: <command>` or `Worktree setup: none`; without the line the run builds one task at a time.
   - `Land gate:` → `npm run <script>`, first of `check`, `test`, `typecheck` in root package.json, else `none`; a task lands only on a pass, so the breaking task fixes it. It runs per task only while the full check stays under 60 s, else verify runs it once.
   - Root package.json has a `lint` script → `Lint: <linter binary>`, else `none`; `npm run lint` skips a task's `Files:`.
   - `Allow:` → each backticked command a task runs that no other field names, else `none`.
3. `## Success criterion`: one backticked command proving every task landed; no interpreted or user-only check.
4. `## Checkpoint`: `Blocks first:`, `Parallel:`, `Shared state:`, `Smallest safe split:`, each naming tasks, a shared target or `none`.
5. `## Tasks`, dependency-ordered.

## Template

```
### Task <n>: <type>(<scope>): <subject>

Depends on: none | <n>[, <n>] | Files: `<path>`[, `<path>`] | Data: <structure, one clause>[ | Design: <skill name>][ | Risk: <category>] | Proof: <one bare command>
```

- `Files:` path ending in `/` → whole folder.
- `Proof:` → shows this task landed, not the suite.
- Runnable result → prove on real project input with its own command, else a builder script using only its tools, never a test alone.
- MCP `Proof:` or Success criterion → `mcp:<tool> <args>`, `<tool>` after `mcp__<server>__`; the session calls it.
- `Data:` → structure holding the result, not its fields or logic; ask before changing a public signature or persisted format.
- `Risk:` → one of `security boundary` (sandbox, deny rules, breach detection, task pin, land-task, deleting files or branches), `persisted format`, `public signature` or `dependency`.
- Heading → `land-task`'s commit subject; the task stages `Files:`, no `Commit:` block.
- `Design:` → skill a task loads first, only for a page's look.

## Rules

1. **Verified names only.** List a path or symbol only after reading its range.
2. **One field line, one task.** Second field line, `Run:`, `Expected:` or code block → long-format, needing `Commit:`, `Run:`, `Expected:`.
3. **Small tasks.** One heading, one concern; split only when `Files:` spans a shared write target and an independent one.
   - Size → mid-size model lands it in one fresh session from its text.
   - `Files:` → also each registry, index or test list that must name an added file.
4. **Shared write target.** File, key or branch two tasks touch → split, unless a shared invariant earns a `Depends on:` edge.
5. **No manual task.** User-only check → one `## Manual checks` line.
