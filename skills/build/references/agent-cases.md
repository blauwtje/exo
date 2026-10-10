# Unit cases

Read on a rare case. Each unit has its own section.

## run-unit

- Ask the user nothing: a choice or build `BLOCKED` returns `BLOCKED`, question, options.
- Edit, write or commit no file yourself: builds edit, land-task commits.
- No tool dispatches → return `BLOCKED all nested dispatch unavailable`, alone.
- A repair → `exo:solve-hard` with the dispatch's `model`, `effort` and `<skill>/drift-repairer-prompt.md` or `<skill>/bug-fixer-prompt.md`.
