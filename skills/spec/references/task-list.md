# The task list

The task list is the part of the brief that the build executes, so each field below is one the plan checker and the executor read. Its code follows `${CLAUDE_PLUGIN_ROOT}/lib/references/lean.md`.

## Sections, in order

1. `## Goal`: one sentence naming the result.
2. `## Plan basis`: `Repository: <absolute root>` and `Branch: <branch>`.
   - With no repo, write `Branch: main`. The executor runs `git init -b main` before the first task, so the plan has no owner init step.
   - When two tasks share no `Depends on:` chain, add `Worktree setup: <command>` or `Worktree setup: none`. Without it, the run builds one task at a time.
   - `Land gate:` is `npm run <script>` for the first of `check`, `test` and `typecheck` in the root package.json, else `none`.
     - A task lands only when it passes; it runs per task only if the full check takes under 60 s, and otherwise the gate runs it once.
   - `Land:` comes from the `ship` setting: `push` gives `push-main`, `open-pr` and `pr-merge` give `pr`, and `ask` recommends `local`.
   - `Autonomy: auto | pause-flagged | approve-each` is optional (default `auto`). Add `| Pause: yes` to an irreversible or outward-facing task (migration, delete, publish) and set `pause-flagged`.
   - With `Land:` `local` or `push-main`, add `Commit: <type(scope): subject>`, the subject of the squash commit.
   - When the root package.json has a `lint` script, write `Lint: <linter binary>`, else `none`. `npm run lint` skips `Files:`.
   - When proofs need a running app, write `App: <start command> | Ready: <url>`, else `none`. The proofs run with it started.
   - `Allow:` lists each backticked task command that no other field names, else `none`.
3. `## Success criterion`: one backticked command that proves every task landed, with no interpreted or user-only check.
   - A command that passes on the run's base is refused unless `Red: none (<reason>)` follows it; for a flaky one add `Repeat: <2-5> (<reason>)`. Each goes on its own line under the command.
   - When `bin` or `scripts.start` exists, the command runs it, else write `Product run: none (<reason>)`.
4. `## Checkpoint`: `Blocks first:`, `Shared state:` and `Smallest safe split:`, each naming tasks or `none`.
   - `Parallel:` reads `Tasks 1, 2 and 3`, `every task` or `none` (serial), no range; no list limits waves, built from `Depends on:` and `Files:`.
5. `## Tasks`, in dependency order.

## Template

```
### Task <n>: <type>(<scope>): <subject>

Depends on: none | <n>[, <n>] | Files: `<path>`[, `<path>`] | Data: <structure, one clause>[ | Design: <skill name>][ | Risk: <category>][ | Red: none (<reason>)][ | Literals: none (<reason>)][ | Evidence: <path> | none (<reason>)] | Proof: <one command>
```

- A `Files:` entry ending `/` means the whole folder.
- `Proof:` shows that this task landed, not that the suite passes.
- For a runnable result, prove it on real input through its own command, or else a builder script that uses only its own tools. A test alone does not prove it.
- An MCP `Proof:` or Success criterion reads `mcp:<tool> <args>`, with `<tool>` as the name after `mcp__<server>__`. The session calls it, not the shell.
- `Data:` names the structure that holds the result, not its fields or logic. Ask before changing a public signature or persisted format.
- `Risk:` is one of `security boundary`, `persisted format`, `public signature` or `dependency`.
- The heading is `land-task`'s conventional-commit subject. `Files:` is staged, and there is no `Commit:` block.
- `Evidence:` goes on one task when its `Files:` change skill or agent wording. It reads `benchmarks/results/<file>`, `benchmarks/pressure/<path>` or `none (<reason>)`.
- `Design:` names a skill that loads first, and only for the look of a page.

## Rules

1. **Verified names only.** List a path or symbol only after reading it.
2. **One field line, one task.** A second field line, a `Run:` or `Expected:` line, or a code block makes the task long-format, which needs `Commit:`, `Run:` and `Expected:`.
3. **Small tasks.** A task holds one concern. Split it only when `Files:` spans a shared write target and an independent one.
   - Size: (task + `Files:` bytes) / 4 over 15,000 fails.
   - `Files:` also lists each registry, index or test list that names an added file, and one existing test per changed source.
4. **Shared write target.** Split a file, key or branch that two tasks touch, unless a shared invariant earns a `Depends on:` edge.
5. **No manual task.** A check only the user can make becomes one `## Manual checks` line.
