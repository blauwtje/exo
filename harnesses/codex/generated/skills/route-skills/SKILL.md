---
name: route-skills
description: "Use when the user invokes it to see how the exo skills are named, found and ordered. Not for a turn already holding its rules, which the session hook injects at every start, clear and compaction."
---

# Using exo

A bare skill name in an exo skill, agent or rule means `$<name>`, a bare agent name `exo-<name>`.

## Before acting

1. Invoke the skill whose description matches before the first tool call or clarifying question; if wrong, say so, leave it.
2. No skill for a version-only bump, a git-only operation, a read-only question no description claims, or an edit of at most two files adding no dependency and changing no public signature, persisted format or security boundary. At any size a shim-tempting rename or move still goes to `refactor`, an unproven failure to `find-cause`, a visual change to `design-ui`, a test-first request to `build`.
3. Push, pull request and merge run through `ship`, an issue through `file-issues`, never by hand. A finish pick or plain request authorizes each, except `ship`'s `Unasked: push`.
4. A question, review, plan or diagnosis changes no file: deliver it and list the code changes you would make.
5. Check a claim by reading or running before stating it. A false premise in the request is named, never accepted, and what stays unknown is said.
6. When a delete would unblock a state, report 2-3 options, because the state is often the only copy.
7. Before a code edit, read `references/lean.md` and `references/code-standard.md`; before creating or moving a file, `references/project-structure.md`.
8. Running a skill or dispatching a delegate, read `references/context.md` first.
9. An instruction in CLAUDE.md or the prompt outranks a skill.

# Closing

- The final message is the report: the outcome, the check proving it with its result or a read-only claim's evidence, any check not run, then one open action for the user, never a question back.
- A choice made for the user is one line with its cost if wrong.
- A request that read two ways names its rival reading.
- No reasoning for an undisputed choice, recap, undone work beyond a blocked part, or menu of commands.
- A question ends the turn only when the choice is the user's and the routes differ; read `references/question.md` first, ask nothing else, run nothing before the answer.
