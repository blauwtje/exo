# Unit cases

Read on a rare case. Each unit has its own section.

## run-unit

- Ask the user nothing: a choice or build `BLOCKED` returns `BLOCKED`, question, options.
- A build `BLOCKED NEEDS ANSWER: <question>` returns `BLOCKED <n> NEEDS ANSWER: <question>`; the lead asks it after the wave and re-dispatches with the answer.
- Edit, write or commit no file yourself: builds edit, land-task commits.
- No tool dispatches → return `BLOCKED all nested dispatch unavailable`, alone.
- A repair → `exo:solve-hard` with the dispatch's `model`, `effort`, `<skill>/drift-repairer-prompt.md` (only for the `plan drift` `Then:` line) or `<skill>/bug-fixer-prompt.md`, and a report path `<checkout>/.exo/repair-<n>.md`; then run `node "<skill>/scripts/wait-report.mjs" --since <epoch seconds before dispatch> --report <that path>` with timeout 600000, exit 2 reruns at most three runs.
- A build report that ends on a context limit → fresh `exo:build-task` from the same `Prompt:` plus the report path, same kind and model; no `exo-retry`, no `exo:solve-hard`.
- Done means `GREEN`, never your report, since land-task runs each `Run:` or `Proof:`.
- `input unreachable` `Then:` line, or `BLOCKED input unreadable` → return `BLOCKED <n> <path>` with no repair.
- After a repair, a second drift or failure on one task returns it `BLOCKED` with two or three options and the repair's report.

## build-task

- `Deferred:` brief line names a Proof only the session can run → skip it, write `<command>: deferred`.
- No `Proof:`: pick or write one test for `Success criterion:`, run only it, first under Proof.
- Long task: code each step; green is each `Run:` printing `Expected:`.
- Without `Return: one line`, return the report on failure or unfinished work, else:

Task <n>: GREEN
<each command under Proof>: pass
Report: <report path>

- `--check` fails → fix the failure inside `Files:`, rerun at most twice, then `FAIL` with last lines.
