---
name: save-session
description: "Use when the user invokes it to save an unfinished session's state for a fresh session after a clear. Not for a plan another executor runs, which spec owns, or finished work, which the commit and pull request record."
---

# Handoff

Freeze what this session knows and the next one cannot rebuild. The enemy is a handoff that pastes the transcript back, so the fresh session pays again for the context the clear just bought. The overcorrection is a page of headlines naming no file, command or next step, leaving the reader to rediscover the work.

## Before writing

- Take no irreversible action to pause: no push, no pull request.
- Pause between atomic steps, never inside one: complete or undo the step in progress; begin no new work.
- Branch other than the repository's default → commit every uncommitted edit first as one `chore: wip <topic>` commit.
- Tree broken → say so in that commit's body.
- Default branch → leave edits uncommitted, list them under `## Current state`.
- Artefact the user explicitly asked to survive the clear (question list, checklist) → preserve verbatim.

## Pointers, not content

- Each section names a path, command, issue number or line range, and stops there.
- Paste no diff, file body or log; the reader can open them, and pasting spends the context the clear freed.
- Error → paste only its failing lines.
- Quote a value only when it exists nowhere on disk, such as a number from an unlogged run.

## Where it goes

1. Read the location, never guess it: `node "{{EXO_ROOT}}/harnesses/codex/run.mjs" "{{EXO_ROOT}}/skills/save-session/scripts/handoff.mjs" path` prints it, the same file `hooks/session-start.mjs` points a resuming session at.
2. Branch name holding `/` → nested path: create parent directories first.
3. Write the file whole, replacing any handoff already at that path: the state it held is what this clear discards.

## What it holds

First line under the H1: `Written: <YYYY-MM-DD>, HEAD <short commit>, branch <name>`, commit from `git rev-parse --short HEAD`.

Then these sections, in this order; each left out when the session has nothing true for it:

- `## Goal`: what the work is for, one or two sentences, and what it will not do.
- `## Current state`: what exists and works now, and what is half-built, each named by file.
- `## Decisions`: one line each, `<decision>, decided by <the user | this session>`.
- `## Files touched`: path, then one clause of what changed there.
- `## Proven`: one line per claim, `<claim>: <the command that proved it>, <its result>`.
- `## Next step`: exactly one action, the first thing the fresh session does.
- `## Open questions`: what is unresolved, and who can answer it.
- `## Resume`: never left out, unlike the sections above.

In those sections:

- User's decision → record as theirs, in their wording, never as shared.
- Plan running and `<plan stem>-decisions.md` beside it → carry its lines into `## Decisions` unchanged.
- Claim no command proved → `## Open questions`, not `## Proven`.
- Read `## Current state` from `git status --short`, not memory.
- List which changes are committed, then every uncommitted path in full, because a next session that cannot see the difference treats working-tree edits as saved and discards them.
- Session running a plan → open `## Current state` with plan path and number of the task in progress.

## Resume

Copy this paragraph into `## Resume` exactly, so the reading session inherits the rule without this skill:

```text
Diff what `## Proven` and `## Files touched` already cover against what `## Next step` and `## Open questions` still need, name the resume point, and repeat no step `## Proven` already covers. Verify an inherited claim against the real artifact before building on it: a prior session's report is not the proof.
```

## References

| File | Read it when |
|---|---|
| `references/reconstructing-without-a-note.md` | Save-session itself starts without a note and must rebuild context before saving. |

## Judgment

- File read this session outranks memory of it: confirm path, branch and commit with a command before writing them down.
- Short true handoff outranks a full one that guesses; what the session does not know → `## Open questions`.
- Turn ends naming the written path and saying to run `/clear`. Nothing else written; no work continues after.
