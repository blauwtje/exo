# configure

Shows and changes exo's settings.

## When it runs

Only when you type `/exo:configure`, to see or change a setting, such as where specs go or how compact replies are.

Not for Claude Code's own `settings.json`, permissions or hooks.

## What you get

- `/exo:configure` alone shows every setting and where each value comes from.
- A named setting is changed with the value you give, then shown again.
- Two scopes: the whole team in this repository (the default), or only you in this repository.
- A value for every project goes through `/config`. exo tells you which row to pick.

## Source

`skills/configure/SKILL.md`.
