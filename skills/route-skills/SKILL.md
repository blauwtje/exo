---
name: route-skills
description: Use when a session starts, after a clear and after a compaction, before any other action, to know how the exo skills are named, found and ordered. Not for a turn that already holds its rules in context.
---

# Using exo

A bare skill name in an exo skill, agent or rule means `exo:<name>`.

## Before acting

1. Invoke the skill whose description matches before the first tool call or clarifying question; when it turns out wrong, say so and leave it.
2. No skill for a version-only bump, a git-only operation, a read-only question no description claims, or an edit of at most two files adding no dependency and changing no public signature, persisted format or security boundary; at any file count an unproven failure still goes to `find-cause`, a visual change to `design-ui`, a test-first request to `build-change`.
3. A push, pull request or merge runs through `ship` and an issue through `file-issues`, never by hand; the finish pick or a plain request authorizes it.

## When several fire

- `find-cause` outranks the rest until a failure's cause is proven.
- `define-scope` decides what to build, `draft-plan` orders it, `run-plan` runs a plan, `build-change` builds without one; the earlier stage wins.
- `audit-architecture` finds where the architecture should change; `define-scope` shapes a change the request names.
- `check-docs`, `design-ui` and `edit-skills` hand control back to a stage that borrowed them and own the turn alone.
- An instruction in CLAUDE.md or the prompt outranks a skill.

# Right-sizing

This ladder keeps complexity low by reusing what exists; it holds before every edit adding or replacing code, with no skill call.

## The ladder

Read the changed ranges and trace control and data flow, then take the first rung that fits in one pass; when two rungs hold, the lower number wins, because comparing rungs overbuilds. Decide without asking; edit in the same turn.

1. **Need.** Build only for a use the request names today, first deleting the branch, duplicate or path it obsoletes; a later use stays out and is listed in the report.
2. **Reuse.** When a symbol, pattern or type in this repository already does the job, found with one search by name or role, reuse it rather than writing a second.
3. **Borrow.** Otherwise take the first source that does it: the standard library, a native platform feature, CSS over script or a database constraint over application code, then a dependency the manifest lists, with no new dependency for what ten lines cover.
4. **Write.** Then write it: the fewest statements the checks accept, one action per line, no call chained into a call into an index, full-word names, guard clauses over nesting.

## Never on the ladder

Trust-boundary checks, failure handling that prevents data loss, what security depends on, accessibility, and every part the user named are built completely on any rung. A shortcut with a known limit carries one comment naming it and how to lift it.

# Context

- **Language.** Replies, reports and questions are in the language of the user's latest message, whatever the skill's; a session opened only by a plan command writes in the plan's language. Code, commits, issues and written files keep the repository's.
- **Command output.** Log output that may pass forty lines under `git rev-parse --git-dir` or a temp directory outside git; read back only failing lines.
- **Progress.** No message between the steps of a run but a block, a failed check or a question only the user can answer.
- **Scope.** Write only the artifacts a skill names, at the length needed.
- **Reader budget.** A read-only dispatch to an agent type without its own limit, such as `general-purpose`, carries a standalone `Budget: 70k/100k` line, because the 40k default stops a reader after a few files.

# Closing

The final message is the report: the outcome, the check proving it with its result or a read-only claim's evidence, any check not run, then one open action for the user, never a question back. A choice made for the user is one line with its cost if wrong, plus the rival reading of a request that read two ways. No reasoning for an undisputed choice, recap, undone work beyond a blocked part, or menu of commands.

A question ends the turn only when the choice is the user's and the routes differ: numbered plain lines, recommended first, no question tool, one a turn, nothing done before the answer; a reply of `1` carries out option 1 at once.
