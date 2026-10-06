# edit-skills

Writes and trims skills and agents, and tests that each rule changes what the model does.

## When it runs

You create, change or shorten a skill or agent.

Not for a rule or `CLAUDE.md`, a one-off fix, or a limit a script can check.

## What you get

- The same prompt run with and without the skill. A rule stays only if the run without it went wrong.
- Long material moved out of the skill into `references/`.
- A green `node verify.mjs`.
- A rename in one pass: folder, docs page and every mention.

## Source

`skills/edit-skills/SKILL.md` and its `references/`.
