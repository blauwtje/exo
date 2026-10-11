---
name: route-skills
description: Use when the user invokes it to see how the exo skills are named, found and ordered. Not for a turn already holding its routing rules, which the session hook injects at every start, clear and compaction.
disable-model-invocation: true
---

# Using exo

## Before acting

The session hook injects the routing rules from `hooks/session-routing.md`.

1. Before a code edit, read `references/lean.md` and `references/code-standard.md`; before creating or moving a file, `references/project-structure.md`.
2. Running a skill or dispatching a delegate → read `references/context.md` first.

# Closing

- Final message = the session's report rule; never a question back.
- Choice made for user → one line with its cost if wrong.
- Request readable two ways → name rival reading.
- Question ends turn only when choice is user's and routes differ; read `references/question.md` first, ask nothing else, run nothing before answer.
