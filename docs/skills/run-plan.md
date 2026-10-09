# run-plan

Runs a plan's unlanded tasks unattended, one headless Claude process per task.

## When it runs

Only when you type `/exo:run-plan <plan>`.

Not for a plan you want built with subagents in this session. Use `build` for that.

## What you get

- Each task lands in its own fresh process, so no context carries from one task to the next.
- A script picks the task and checks git after each process; a process that lands anything else stops the run.
- One verify process and the verify script run at the end.
- Logs, `summary.txt`, `tasks.json` and `progress.md` under `.exo/run-plan/`.

## Source

`skills/run-plan/SKILL.md`, which starts `skills/build/scripts/run-plan.mjs`.
