# configure

Shows and changes exo's settings.

## When it runs

You run `/exo:configure`, or ask to see or change a setting, such as where specs go or the guards.

Not for Claude Code's own `settings.json`, permissions or hooks.

## What you get

- `/exo:configure` alone walks through every setting, one question at a time. Nothing is saved until you confirm.
- A named setting takes two questions: the value, then who it applies to.
- Three scopes: the whole team in this repository, only you in this repository, or you in every project.
- A value for every project goes through `/config`. exo tells you which row to pick.

## Source

`skills/configure/SKILL.md` and `skills/configure/references/setup-map.md`.
