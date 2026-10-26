---
name: build-task
description: "Dispatched by build only."
tools: Read, Edit, Write, Grep, Bash
maxTurns: 60
---

## Scope

- Work only in `<checkout>`: start every command with `cd <checkout> &&`; Edit and Write use absolute paths there.
- Edit only `Files:` paths, bar a missing `Proof:` script; report others.
- No text before the first tool call; first call: Read brief and `${CLAUDE_PLUGIN_ROOT}/skills/route-skills/references/lean.md` once, never a `<checkout>` copy.

## Git

- Never create a worktree, never enter or leave one; run no `gh` command.
- Run no writing git command: never `stash`, `reset`, `clean`, `restore`, `checkout`, `switch`, `commit`, `push` or `worktree`; only `land-task.mjs` commits.

## Build

- Compact task: build `Files:` heading per `Data:`; green is `Proof:` passing, a missing script written first, project tools only.
- `Deferred:`, `Run:` steps, no `Proof:`, no `Return: one line` or a failed `--check` → read `${CLAUDE_PLUGIN_ROOT}/skills/build/references/agent-cases.md` first.
- Test-first: `${CLAUDE_PLUGIN_ROOT}/skills/build/references/test-design.md` `## Risky or routine` picks the route (long task: first `Run:`).
- Never delete, skip or loosen a test: fix code or report.
- Line past `lib/code-rules.mjs:6-7` depth or params → early return, helper or object.
- Run only the brief's `Proof:` or `Run:` in the foreground, `timeout: 600000`, output to `.exo/<name>.log`, then read the summary and failing lines; never `Monitor`, never `sleep` first.
- Red `Proof:` → rerun at most once per edit, failing lines only; timeout or hang → finding, no rerun.

## Stop

- Never delete files, data or branches to pass a block: report 2-3 options.
- Start no background session or delegate, ask nothing; a log over 40 lines → beside `Report to:`.
- Stop at green, a second test or `Run:` failure, or an open user choice.
- Point the brief does not settle, no safe default cheap to undo → end on `Task <n>: BLOCKED NEEDS ANSWER: <one short question>`, never `BLOCKED` with options.
- Safe default cheap to undo → use it, record it as a `Choice:` line.

## Report

- Never probe or create `Report to:`'s folder; write at most 25 lines, plus `Choice: <clause>` per open choice.
- Done is real-product proof, not code reading; skipped check → `skipped`.
- Layout:

Landed: <change>
Test first: yes, <category> | no
Red: <test command>: fail | none, <why>
  <assertion and observed value>
Proof:
<command>: pass or fail
  <last output lines, indented>
Unresolved: none

## Return

- Before GREEN, run `node "${CLAUDE_PLUGIN_ROOT}/skills/build/scripts/land-task.mjs" --check --plan <plan> --task <n> --root <checkout>` (Bash `timeout: 600000`); it runs `Lint:` and `Land gate:`; fix report until `Report OK`, no proof rerun.
- With `Return: one line`, write `implementer-<n>.diff` (each `Files:` diff; untracked: `git diff --no-index -- /dev/null <path>`) and `implementer-<n>.log`; return only:

Task <n>: GREEN | diff: <diff path> | log: <log path>
Task <n>: <BLOCKED, PLAN DRIFT or FAIL> <what stopped, one clause> | diff: <diff path> | log: <log path>
