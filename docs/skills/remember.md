# remember

Saves a correction about this repository so later sessions follow it.

## When it runs

Only when you type `/exo:remember`, to save a correction, see what exo remembers, or forget a line.

Not for build or test commands, which go in `AGENTS.md` or `CLAUDE.md`.

## What you get

- A line is proposed only after two separate sessions recorded the same correction, and written only after you approve it.
- A lesson a lint rule or test could catch is offered as that check first, with the text line as the second choice.
- A line you decline, or turn into a check, is not proposed again until a new session records it.
- A size limit on the memory file.
- Lines dropped when the files they mention are gone.

## Source

`skills/remember/SKILL.md`.
