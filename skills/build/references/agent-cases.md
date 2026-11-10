# Unit cases

Read on a rare case. Each unit has its own section, and a **unit** is one delegate that `build` dispatches.

## task-runner

- A choice or a build `BLOCKED` returns `BLOCKED`, the question and the options.
- A build `BLOCKED NEEDS ANSWER: <question>` returns `BLOCKED <n> NEEDS ANSWER: <question>`. The lead asks it after the wave and re-dispatches with the answer.
- Leave edits, writes and commits to others: builds edit, land-task commits.
- When no tool dispatches, return `BLOCKED all nested dispatch unavailable`, alone.
- Send a repair to `exo:build-task` with `exo-kind: hardest` with the dispatch's `model`, `effort`, `<skill>/drift-repairer-prompt.md` (only for the `plan drift` `Then:` line) or `<skill>/bug-fixer-prompt.md`, and a report path `<checkout>/.exo/repair-<n>.md`. Run it in the foreground, because a background run ends the turn early, and read that report when it returns.
- When a build report ends on a context limit, start a fresh `exo:build-task` from the same `Prompt:` plus the report path, same kind and model, without `exo-retry` or a hardest repair.
- Done means `GREEN` from land-task, which runs each `Run:` or `Proof:`, and your own report does not count.
- On an `input unreachable` `Then:` line, or `BLOCKED input unreadable`, return `BLOCKED <n> <path>` with no repair.
- After a repair, a second drift or failure on one task returns it `BLOCKED` with two or three options and the repair's report.

## build-task

- A `Deferred:` brief line names a Proof only the session can run. Skip it and write `<command>: deferred`.
- With no `Proof:`, pick or write one test for `Success criterion:`, run only it, and list it first under Proof.
- In a long task, code each step. Green is each `Run:` printing `Expected:`.
- Report layout:

Landed: <change>
Test first: yes, <category> | no
Red: <test command>: fail | none, <why>
  <assertion and observed value>
Proof:
<command>: pass or fail
  <last output lines>
Unresolved: none

- When a service is down, run `node ${CLAUDE_PLUGIN_ROOT}/lib/services.mjs --root <checkout>` once and rerun. If it is still down, return `BLOCKED <n> ENV` and edit no code.
- When `--check` fails, fix the failure inside `Files:` and rerun at most twice, then return `FAIL` with the last lines.
- With `Return: one line`, write `implementer-<n>.diff` (each `Files:` diff; untracked: `git diff --no-index -- /dev/null <path>`) and `implementer-<n>.log`, and return only:

Task <n>: GREEN | diff: <diff path> | log: <log path>
Task <n>: <BLOCKED, PLAN DRIFT or FAIL> <what stopped, one clause> | diff: <diff path> | log: <log path>

## orchestrator

- Send 2+ independent parts of 6+ tool turns each to the `exo:orchestrator` agent with `Workers: <n>` and `Reads:`.
