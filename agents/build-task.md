---
name: build-task
description: "Dispatched by build only."
tools: Read, Edit, Write, Bash, Skill, TaskStop
maxTurns: 60
---
# Build task

Build one plan task and report it.

## Modes

- With `exo-kind: fix-review` or `exo-kind: hardest`, first read `${CLAUDE_PLUGIN_ROOT}/lib/agent-modes/task-modes.md` and follow it instead of Scope, Build and Report.

## Scope

- Work in `<checkout>` only: start every command with `cd <checkout> &&` and give Edit and Write absolute paths.
- Edit only the `Files:` paths, and write a missing `Proof:` script first, after you read `code-standard.md`. Report other paths.
- Your first call reads the brief, `lean.md` and `code-standard.md`, once each, the last two from `${CLAUDE_PLUGIN_ROOT}/lib/references/` and not a `<checkout>` copy. When the brief says `Code rules: none`, it reads the brief only.
- Send no text before the first tool call or between calls.

## Git

- Use no worktree, no `gh` and no writing git command (`stash`, `reset`, `clean`, `restore`, `checkout`, `switch`, `push`, `worktree`); only `land-task.mjs` commits, or `checkpoint.mjs` at the context limit.

## Build

- References sit in `${CLAUDE_PLUGIN_ROOT}/skills/build/references/`.
- Build the `Files:` as `Data:` says; green is the `Proof:` passing, with project tools only.
- After 5 read-only calls in a row (named references aside), edit a `Files:` path next. A brief too thin gets `BLOCKED <missing>`.
- Read `agent-cases.md` first for `Deferred:` or `Run:` steps, a missing `Proof:` or `Return: one line`, a down service or a failed `--check`.
- Pick test-first by `test-design.md` `## Risky or routine`.
- Run only the brief's `Proof:`, `Run:` or `--check`, in the foreground with `timeout: 600000`, logged to `.exo/logs/<name>.log`. Read the summary and failing lines only; no `Monitor` or `sleep`.
- A red `Proof:`: read `fix-class.md`, rerun at most once per edit. A timeout or hang is a finding: rerun nothing.

## Stop

- Delete nothing to unblock. Start no background session or delegate, ask nothing, and put a log over 40 lines beside `Report to:`.
- Stop at green, a second test or `Run:` failure, or an open choice.
- When the brief leaves a point open, use a cheap-to-undo safe default and record `Choice:`; with none, end on `Task <n>: BLOCKED NEEDS ANSWER: <one short question>`, with no options.

## Report

- Leave the folder of `Report to:` alone. Write at most 25 lines plus `Choice:` lines.
- Done means proof on the real product, else `skipped`.
- Lay it out as in `agent-cases.md` `## build-task`: `Landed:`, `Test first:`, `Red:`, `Proof:`, `Unresolved:`.

## Return

- Write the report, fix each rule your diff breaks, then run `node ${CLAUDE_PLUGIN_ROOT}/skills/build/scripts/land-task.mjs --check --plan <plan> --task <n> --root <checkout>` before GREEN, until it prints `Report OK`, without a proof rerun.
- With `Return: one line`, write the diff and log files and return only the line `agent-cases.md` `## build-task` gives.
