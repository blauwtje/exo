# run-plan

Hands a plan's unlanded tasks to `build`, or installs the terminal `exo run`.

## When it runs

Only when you type `/exo:run-plan <plan>` or `/exo:run-plan setup`.

Not for the headless loop: that runs only from your terminal as `exo run <plan>`.

## What you get

- `exo:build <plan>` runs the plan in this session, each task landed by agents.
- `setup` installs `exo run` for your terminal, where each task runs in its own headless process.
- One closing line pointing to `exo run <plan> --detach`.

## Other providers

`exo run` can use DeepSeek or Z.ai instead of Claude. Two terminal subcommands set that up:

- `exo key set <provider>` stores the provider's key in `~/.config/exo/keys.env`. It asks for the key without echoing it, or reads one line from stdin when piped, and never prints it.
- `exo claude --provider <name> [--effort <level>] [-- <claude args>]` starts an interactive Claude Code session on that provider. A missing key stops it with the line `exo key set <name>`.

## Source

`skills/run-plan/SKILL.md`, which invokes `build`.
