# The task list

Reader has no context: no implicit file, shape or step.

## Sections, in order

1. `## Goal`: one sentence naming result.
2. `## Plan basis`: `Repository: <absolute root>` and `Branch: <branch>`; no repo yet → `Branch: main` and the executor runs `git init -b main` there before the first task, never an init step for the owner.
   - Two tasks share no `Depends on:` chain → `Worktree setup: <command>` or `Worktree setup: none`; without the line the run builds one task at a time.
   - `Land gate:` → `npm run <script>`, first of `check`, `test`, `typecheck` in root package.json, else `none`; task lands only on pass; breaking task fixes it. Per task only for full check under 60 s, else verify runs it once.
   - Root package.json `lint` script → `Lint: <linter binary>`, else `none`; `npm run lint` skips task's `Files:`.
   - `Allow:` → each backticked task command no other field names, else `none`.
3. `## Success criterion`: one backticked command proving every task landed; no interpreted or user-only check.
4. `## Checkpoint`: `Blocks first:`, `Shared state:`, `Smallest safe split:`, each naming tasks, shared target or `none`; `Parallel:` → `Tasks 1, 2 and 3` or `every task` sharing no `Depends on:` chain or `Files:` path, else `none`; no range or clause.
5. `## Tasks`, dependency-ordered.

## Template

```
### Task <n>: <type>(<scope>): <subject>

Depends on: none | <n>[, <n>] | Files: `<path>`[, `<path>`] | Data: <structure, one clause>[ | Design: <skill name>][ | Risk: <category>] | Proof: <one bare command>
```

- `Files:` path ending in `/` → whole folder.
- `Proof:` → shows this task landed, not suite.
- Runnable result → prove on real project input with its own command, else builder script using only its tools, never test alone.
- MCP `Proof:` or Success criterion → `mcp:<tool> <args>`, `<tool>` after `mcp__<server>__`; session calls it, not shell.
- `Data:` → structure holding result, not fields or logic; ask before one changing public signature or persisted format.
- `Risk:` → one of `security boundary`, `persisted format`, `public signature` or `dependency`.
- Heading → `land-task`'s conventional-commit subject.
- The task stages `Files:`; no `Commit:` block.
- `Design:` → skill loaded first, only for page's look.

## Rules

1. **Verified names only.** List path or symbol only after reading its range.
2. **One field line, one task.** Second field line, `Run:`, `Expected:` or code block → long-format, needing `Commit:`, `Run:`, `Expected:`.
3. **Small tasks.** One heading, one concern; split only when `Files:` spans shared write target and independent one.
   - Size → mid-size model lands it from its text in one fresh session.
   - `Files:` → also each registry, index or test list naming added file.
4. **Shared write target.** File, key or branch two tasks touch → split, unless shared invariant earns `Depends on:` edge.
5. **No manual task.** User-only check → one `## Manual checks` line.
