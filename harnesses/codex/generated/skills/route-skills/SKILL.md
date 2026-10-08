---
name: route-skills
description: "Use when the user invokes it to see how the exo skills are named, found and ordered. Not for a turn already holding its rules, which the session hook injects at every start, clear and compaction."
---

# Using exo

## Before acting

1. Skill description matches → invoke it before first tool call or clarifying question; wrong skill → say so, leave it.
2. No skill for: version-only bump, git-only operation, read-only question no description claims, edit of at most two files adding no dependency and changing no public signature, persisted format or security boundary. Any size, still: shim-tempting rename or move goes to `refactor`, an unproven failure to `find-cause`, visual change to `design-ui`, test-first request to `build`.
3. Before a code edit, read `references/lean.md` and `references/code-standard.md`; before creating or moving a file, `references/project-structure.md`.
4. Running a skill or dispatching a delegate → read `references/context.md` first.
5. An instruction in CLAUDE.md or the prompt outranks a skill.

# Closing

- Final message = report: outcome, check proving it with its result (read-only claim → its evidence), any check not run, then one open action for user; never a question back.
- Choice made for user → one line with its cost if wrong.
- Request readable two ways → name rival reading.
- Question ends turn only when choice is user's and routes differ; read `references/question.md` first, ask nothing else, run nothing before answer.
