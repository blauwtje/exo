# The task list

## Sections, in order

1. `## Goal`: one sentence naming result.
2. `## Plan basis`: `Repository: <absolute root>`, `Branch: <branch>`; no repo → `Branch: main`; executor runs `git init -b main` before first task, never an owner init step.
   - Two tasks share no `Depends on:` chain → `Worktree setup: <command>` or `Worktree setup: none`; without it run builds one task at a time.
   - `Land gate:` → `npm run <script>`, first of `check`, `test`, `typecheck` in root package.json, else `none`; lands only on pass. Per task only if full check under 60 s, else gate runs it once.
   - `Land:` → `ship` setting; `push` → `push-main`; `open-pr`, `pr-merge` → `pr`; `ask` → recommend `local`.
   - `Land:` `local` or `push-main` → `Commit: <type(scope): subject>`, the squash commit's subject.
   - Root package.json `lint` script → `Lint: <linter binary>`, else `none`; `npm run lint` skips `Files:`.
   - Proofs need a running app → `App: <start command> | Ready: <url>`, else `none`; proofs run with it started.
   - `Allow:` → each backticked task command no other field names, else `none`.
3. `## Success criterion`: one backticked command proving every task landed; no interpreted or user-only check.
   - Passes on run's base → refused, unless `Red: none (<reason>)`; flaky → `Repeat: <2-5> (<reason>)`; each on own line under command.
   - `bin` or `scripts.start` → command runs it; else `Product run: none (<reason>)`.
4. `## Checkpoint`: `Blocks first:`, `Shared state:`, `Smallest safe split:`, each naming tasks or `none`; `Parallel:` → `Tasks 1, 2 and 3` or `every task` sharing no `Depends on:` chain or `Files:` path, else `none`; no range.
5. `## Tasks`, dependency-ordered.

## Template

```
### Task <n>: <type>(<scope>): <subject>

Depends on: none | <n>[, <n>] | Files: `<path>`[, `<path>`] | Data: <structure, one clause>[ | Design: <skill name>][ | Risk: <category>][ | Red: none (<reason>)][ | Literals: none (<reason>)][ | Evidence: <path> | none (<reason>)] | Proof: <one command>
```

- `Files:` ending `/` → whole folder.
- `Proof:` → shows this task landed, not suite.
- Runnable result → prove on real input via own command, else builder script using only its tools, never test alone.
- MCP `Proof:` or Success criterion → `mcp:<tool> <args>`, `<tool>` after `mcp__<server>__`; session calls it, not shell.
- `Data:` → structure holding result, not fields or logic; ask before changing public signature or persisted format.
- `Risk:` → one of `security boundary`, `persisted format`, `public signature` or `dependency`.
- Heading: `land-task`'s conventional-commit subject; `Files:` staged, no `Commit:` block.
- `Evidence:` → one task when `Files:` change skill or agent wording: `benchmarks/results/<file>`, `benchmarks/pressure/<path>` or `none (<reason>)`.
- `Design:` → skill loaded first, only for page's look.

## Rules

1. **Verified names only.** List path or symbol only after reading it.
2. **One field line, one task.** Second field line, `Run:`, `Expected:` or code block → long-format, needing `Commit:`, `Run:`, `Expected:`.
3. **Small tasks.** One concern; split only when `Files:` spans shared write target and independent one.
   - Size → (task + `Files:` bytes) / 4 over 15,000 fails.
   - `Files:` → also each registry, index or test list naming added file, and one existing test per changed source.
4. **Shared write target.** File, key or branch two tasks touch → split, unless shared invariant earns `Depends on:` edge.
5. **No manual task.** User-only check → one `## Manual checks` line.
