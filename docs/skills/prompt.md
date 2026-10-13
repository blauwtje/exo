# prompt

Rewrites a rough prompt for Claude and shows it, then runs it only after you say yes.

## When it runs

Only when you type `/exo:prompt <rough prompt>`.

Not for running a prompt unseen. Type the prompt as it is for that.

## What you get

- One fenced block with your prompt rewritten: the goal first, thinking cues and filler gone, pasted text wrapped and kept verbatim.
- Nothing is added that you did not write: no new file, cause, check or requirement. A point you left unclear stays unclear.
- One line asking for ok. A plain yes runs the block as your request in this session; "yes, but drop X" revises it and shows it again.
- No questions, no code reading, nothing written to disk.

## Source

`skills/prompt/SKILL.md`.
