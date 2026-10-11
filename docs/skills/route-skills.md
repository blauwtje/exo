# route-skills

The routing rules: the core ones come with every session, the rest when you ask for them.

## When it runs

The session hook injects the routing rules from `hooks/session-routing.md` at every session start, resume, `/clear` and compaction, after your current settings, a pointer to a saved session or memory for your branch, and the lines of `hooks/session-rules.md`. The rest of route-skills runs only when you call it.

## What you get

- Which skill handles which request, and which wins when two fit.
- A size check before each code edit, with minimums that are never skipped: trust-boundary checks, error handling, security and accessibility.
- One format for replies, reports and questions.

## Source

`skills/route-skills/SKILL.md`.
