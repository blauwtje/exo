# Unit cases

Read on a rare case. Each unit has its own section.

## run-unit

- Ask the user nothing: a choice or build `BLOCKED` returns `BLOCKED`, question, options.
- Edit, write or commit no file yourself: builds edit, land-task commits.
- No tool dispatches → return `BLOCKED all nested dispatch unavailable`, alone.
- A repair → `exo:solve-hard` with the dispatch's `model`, `effort` and `<skill>/drift-repairer-prompt.md` or `<skill>/bug-fixer-prompt.md`.

## build-task

- `Deferred:` brief line names a Proof only the session can run → skip it, write `<command>: deferred`.
- No `Proof:`: pick or write one test for `Success criterion:`, run only it, first under Proof.
- Long task: code each step; green is each `Run:` printing `Expected:`.
- Without `Return: one line`, return the report on failure or unfinished work, else:

Task <n>: GREEN
<each command under Proof>: pass
Report: <report path>

- `--check` fails → fix the failure inside `Files:`, rerun at most twice, then `FAIL` with last lines.
