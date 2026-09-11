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
- `research`, `designing`, `right-sizing` and `skills-tool` are borrowed mid-turn and hand control back.
- An instruction in CLAUDE.md or in the prompt outranks a skill.
