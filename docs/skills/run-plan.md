# run-plan

Hands a plan's unlanded tasks to `build`, or installs the terminal `exo run`.

## When it runs

Only when you type `/exo:run-plan <plan>` or `/exo:run-plan setup`.

Not for the headless loop: that runs only from your terminal as `exo run <plan>`.

## What you get

- `exo:build <plan>` runs the plan in this session, each task landed by agents.
- `setup` installs `exo run` for your terminal, where each task runs in its own headless process.
- One closing line pointing to `exo run <plan> --detach`.

## Source

`skills/run-plan/SKILL.md`, which invokes `build`.
