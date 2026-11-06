# start

Picks the right skill when you do not remember its name.

## When it runs

Only when you type `/exo:start`, `/exo:start <goal>` or `/exo:start <spec-path>`.

## What you get

- No goal: a short board of what is open here (plans with landed tasks, parked or stopped runs, unmerged branches and worktrees, a saved session, briefs with open points) and the one next action. With nothing open, a cheat sheet of every exo skill in plain words.
- A goal: exo picks the skill and runs it. For a skill you must type yourself, it gives you the command.
- A spec path or big wish: `spec` writes the brief, then offers to `build` it.
- No skill fits: exo does the work without one.

## Source

`skills/start/SKILL.md`, `skills/start/scripts/board.mjs` and `skills/start/references/cheat-sheet.md`.
