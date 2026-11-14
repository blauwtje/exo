# gate

Checks a finished plan's branch and reviews it once.

## When it runs

Every task in a plan has landed and the branch needs checking before a pull request.

## What you get

- Each task's proof command and the plan's success check, run once, as `PASS` and `FAIL` lines.
- On a `FAIL`, nothing is edited or rerun; the lines go back to `build`.
- With all `PASS`, one review of the branch by the built-in `code-review` skill, `medium` when a landed task has a `Risk:` line, else `low`; a finding goes back to `build`.
- A handoff to `ship`.

## Source

`skills/gate/SKILL.md` and `skills/gate/scripts/verify.mjs`.
