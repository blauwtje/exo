# route-skills

The routing rules, shown when you ask for them.

## When it runs

Only when you call it. The session hook no longer injects it: at every session start, resume, `/clear` and compaction the hook adds only your current settings, a pointer to a saved session or memory for your branch, and the lines of `hooks/session-rules.md`.

## What you get

- Which skill handles which request, and which wins when two fit.
- A size check before each code edit, with minimums that are never skipped: trust-boundary checks, error handling, security and accessibility.
- One format for replies, reports and questions.

## Source

`skills/route-skills/SKILL.md`.
