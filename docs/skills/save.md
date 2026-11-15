# save

Saves unfinished work to a file so a fresh session can pick it up.

## When it runs

When you ask to save, pause or hand off the session, usually before `/clear`, and when a fresh session on the same branch is told "continue from the handoff".

Not for finished work. The commit and pull request already record it.

## What you get

- One file with the goal, current state, decisions, what is proven, and the next step.
- Paths and commands, not pasted logs or diffs.
- The file is tied to your branch, so the next session on that branch finds it with no path to paste.

## Source

`skills/save/SKILL.md`.
