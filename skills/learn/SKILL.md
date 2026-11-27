---
name: learn
description: "Turns a repeated correction into a failing check or one short lesson note. Use when the user corrects the same thing twice, says remember this, or asks to mine past sessions or prune CLAUDE.md."
argument-hint: "[capture | mine | prune]"
---

# Learn

**A correction the user had to make twice becomes a check that fails.** A note can be skipped; a failing test or lint rule cannot. Write a note only when no check fits, and only for a lesson that would hold on a different task, because every note costs context in every session.

Read `${CLAUDE_PLUGIN_ROOT}/BASE.md` first.

Pick the mode from the request: a repeated correction or "remember this" is **capture**, a request to search past sessions is **mine**, and a request to clean up CLAUDE.md is **prune**.

## Capture

1. Find a check the project already runs, such as a lint rule, a test or a script, and add the rule or case, scoped to the files the lesson is about.
2. Run it on the mistake from this session and show it failing. Report how many existing lines it flags, and how to undo it.
3. A lesson about how a skill or agent works becomes an edit to that skill or agent, when its file is in the project or the user's config folder. Remove or tighten a line before you add one.
4. When no check fits, offer the lesson as one line, and write the note only on a yes.

## Mine

Search past sessions with `rg -l -g '*.jsonl' -e '<phrase>' ~/.claude/projects` and read the user's own prompts. Keep a correction or wish only when it shows up in at least two sessions. List each as one numbered line with its dates, and ask once which to keep: numbers, `all`, `none` or `later`. Write the kept ones as in Capture.

## Prune

Read the project and user CLAUDE.md files and mark each line keep, update or delete against the current tree. Delete a line that a check now enforces or the tree contradicts, and move a lesson you find there to a check or a note. Propose the edits and wait for the user's yes.

## A note

Write one file per topic, named in kebab-case: `.claude/rules/lessons/<topic>.md` for a project lesson, `~/.claude/lessons/<topic>.md` for a personal one. Use the Write and Edit tools, because a sandboxed shell cannot write in the config folder. Past 20 notes, merge into an old note instead of adding one. `type` is `feedback` for a correction or `project` for a fact, and `paths:` lists the globs the lesson applies to.

```markdown
---
name: ask before deleting fixtures
description: When a task deletes or rewrites files in test/fixtures
type: project
paths: ["test/fixtures/**"]
---
Ask before you delete or rewrite a fixture file.
Why: fixtures are recorded from production and cannot be made again; two were restored by hand.
How to apply: list the fixtures you would change and wait for a yes.
```

Then add one line for it to the index file named `lessons` in the rules folder next to the store (`.claude/rules/` or `~/.claude/rules/`), which Claude Code loads: `- [<name>](<path>) — <description>`.

End with one line per lesson and how to undo it.
