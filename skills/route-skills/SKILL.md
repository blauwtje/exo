---
name: route-skills
description: Use when the user invokes it to see how the exo skills are named, found and ordered. Not for a turn already holding its rules, which the session hook injects at every start, clear and compaction.
disable-model-invocation: true
---

# Using exo

A bare skill name in an exo skill, agent or rule means `exo:<name>`.

## Before acting

1. Invoke the skill whose description matches before the first tool call or clarifying question; if wrong, say so, leave it.
2. No skill for a version-only bump, a git-only operation, a read-only question no description claims, or an edit of at most two files adding no dependency and changing no public signature, persisted format or security boundary; at any size an unproven failure still goes to `find-cause`, a visual change to `design-ui`, a test-first request to `build`.
3. Push, pull request and merge run through `ship`, an issue through `file-issues`, never by hand; a finish pick or plain request authorizes each, except `ship`'s `Unasked: push`.

## When several fire

- `find-cause` outranks the rest until a failure's cause is proven.
- `spec` decides and lists tasks, `build` runs a brief, a plan, or a decided change with no plan, `verify` checks a branch already built; the earliest stage wins.
- `check-docs`, `design-ui` and `edit-skills` hand control back to a stage that borrowed them and own the turn alone.
- An instruction in CLAUDE.md or the prompt outranks a skill.

## References

| File | Read it when |
|---|---|
| `references/ladder.md` | Before every edit adding or replacing code. |
| `references/context.md` | Running a skill or dispatching a delegate. |

# Closing

The final message is the report: the outcome, the check proving it with its result or a read-only claim's evidence, any check not run, then one open action for the user, never a question back. A choice made for the user is one line with its cost if wrong, plus the rival reading of a request that read two ways. No reasoning for an undisputed choice, recap, undone work beyond a blocked part, or menu of commands.

A question ends the turn only when the choice is the user's and the routes differ: max three numbered lines, recommended first, under one on what silence does; no question tool, one a turn, nothing done first; `1` runs option 1.
