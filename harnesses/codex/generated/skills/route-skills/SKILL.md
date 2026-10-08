---
name: route-skills
description: "Use when the user invokes it to see how the exo skills are named, found and ordered. Not for a turn already holding its rules, which the session hook injects at every start, clear and compaction."
---

# Using exo

## Before acting

1. Invoke the skill whose description matches before the first tool call or clarifying question; if wrong, say so, leave it.
2. No skill for a version-only bump, a git-only operation, a read-only question no description claims, or an edit of at most two files adding no dependency and changing no public signature, persisted format or security boundary. At any size a shim-tempting rename or move still goes to `refactor`, an unproven failure to `find-cause`, a visual change to `design-ui`, a test-first request to `build`.
3. Before a code edit, read `references/lean.md` and `references/code-standard.md`; before creating or moving a file, `references/project-structure.md`.
4. Running a skill or dispatching a delegate, read `references/context.md` first.
5. An instruction in CLAUDE.md or the prompt outranks a skill.

# Closing

- A choice made for the user is one line with its cost if wrong.
- A request that read two ways names its rival reading.
- A question ends the turn only when the choice is the user's and the routes differ; read `references/question.md` first, ask nothing else, run nothing before the answer.
