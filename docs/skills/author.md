# author

Writes and trims skills and agents, and tests that each rule changes what the model does.

## When it runs

Only when you type `/exo:author`, to create, change or shorten a skill or agent.

Not for a rule or `CLAUDE.md`, a one-off fix, or a limit a script can check.

## What you get

- A skill or agent where each rule changes what the model does and carries its reason.
- Long material moved out of the skill into `references/`, one level deep.
- The failure recorded in `docs/failures.md` before the edit.
- A green `npm run validate:static`.

## Source

`skills/author/SKILL.md` and `skills/author/references/instruction-style.md`.
