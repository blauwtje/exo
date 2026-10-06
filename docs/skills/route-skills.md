# route-skills

The rules every session starts with. You never call it.

## When it runs

At every session start, resume, `/clear` and compaction.

## What you get

- Which skill handles which request, and which wins when two fit.
- A size check before each code edit, with minimums that are never skipped: trust-boundary checks, error handling, security and accessibility.
- One format for replies, reports and questions.
- Your current settings, and a pointer to a saved session or memory for your branch.

## Source

`skills/route-skills/SKILL.md`, loaded by `hooks/session-start.mjs`.
