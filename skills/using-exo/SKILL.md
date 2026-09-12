---
name: using-exo
description: Use at the start of every session, after a clear and after a compaction, before any other action, to know how the exo skills are named, found and ordered.
---

# Using exo

Every exo skill is invoked as `exo:<name>`; a bare name in a skill, agent or rule body means that skill.

## Before acting

1. Match the request against the skill descriptions before the first tool call, including a clarifying question.
2. When one fires, invoke and follow it; when it turns out wrong, say so and leave it.
3. Use no skill for a one-file correction or rename, a version-only bump, a git-only operation or a read-only question.

## When several fire

- `debug` outranks the rest until a failure's cause is proven.
- `shaping` decides what to build, `planning` orders it, `implementing` runs a plan, `implementing-batch` builds in the session; the earlier stage wins.
- `research`, `designing` and `skills-tool` are borrowed mid-turn and hand control back.
- An instruction in CLAUDE.md or in the prompt outranks a skill.

# Right-sizing

This ladder holds before every edit that adds or replaces code, and it answers an explicit ask for the minimal, simplest, lean or YAGNI version; no skill call brings it.

## The ladder

Read the ranges the change touches and follow the real flow through them before the first rung: lazy about the solution, never about reading. Then answer each rung from those ranges, in one pass, and stop at the first that holds; when two rungs hold, the earlier one wins without weighing, because weighing rungs is the over-build moved into thinking.

Decide it without asking and edit in the same turn: a question about the shape ends a headless session before any code.

1. **Need.** The request names a present use; a use imagined for later is skipped and named in the report, because unused code is read and maintained by everyone after you.
2. **Present.** A symbol, pattern or type in this repository already does it, found by one search for its name or role: reuse it, because a second copy splits the codebase in two.
3. **Standard library.** The language's standard library does it: call it, because more people have tested it than any file here.
4. **Platform.** A native feature does it, such as a date input over a picker component, CSS over script, or a database constraint over application code: use it, because the platform ships the edge cases.
5. **Installed.** A dependency already in the manifest does it: use it, and add no new one for what ten lines cover.
6. **Minimum.** Write the fewest statements that pass the checks, one thing per line: no chained call into a call into an index, full-word names, a guard clause over nesting.

## Never on the ladder

Trust-boundary validation, error handling that prevents data loss, security, accessibility, and anything the user asked for by name are built in full at whatever rung the code lands on. A corner cut with a known ceiling gets one comment naming the ceiling and the upgrade path, because that constraint is what the next reader needs.
