---
name: handoff
description: Use when the user invokes it to save an unfinished session's state for a fresh session after a clear. Not for a plan another executor runs, which planning owns, or finished work, which the commit and pull request record.
argument-hint: "[what the next session must not lose]"
disable-model-invocation: true
---

# Handoff

Freeze what this session knows and the next one cannot rebuild. The enemy is the handoff that pastes the transcript back, so the fresh session pays again for the context the clear just bought. The overcorrection is a page of headlines naming no file, no command and no next step, leaving the reader to rediscover the work.

## When to use

- The user invokes it: the work is unfinished and the context is about to be cleared.
- Not for work another executor runs from a specification: that is a plan, and `planning` owns it.
- Not for finished work: the commit, the pull request and the changelog record that.
- Not for reconstructing state with no note to read: `references/reconstructing-without-a-note.md` mines the branch, the log, the diff against base, and open PRs and issues instead.

## Before writing

Stop at a safe boundary before you write: finish the current atomic step or back it out, start nothing new, and take no irreversible action to pause, so no PR and no push unless one was already out. On a branch other than the repository's default, commit every uncommitted edit as one `wip:` commit first, and say in the body when the tree is broken; on the default branch, leave the edits uncommitted and list them under `## Current state` as below. Preserve verbatim any artefact the user explicitly asked to survive the clear, such as a question list or a checklist.

## Where it goes

1. Read the location, never guess it: `node skills/handoff/scripts/handoff.mjs path` prints it, the same file `hooks/session-start.sh` points a resuming session at. Nothing under that path is committed, and a linked worktree has one of its own, so a handoff cannot follow the wrong branch.
2. A branch name holding `/` makes a nested path: create the parent directories first. A detached HEAD prints a path ending HEAD.md.
3. Outside a git repository the path falls back to the config directory, keyed by the working directory's own name.
4. Write the file whole, replacing any handoff already at that path: the state it held is what this clear discards.

## What it holds

The first line under the H1 is `Written: <YYYY-MM-DD>, HEAD <short commit>, branch <name>`, the commit from `git rev-parse --short HEAD`, so the next reader can tell a stale handoff from a current one.

Then these sections, in this order, each left out when the session has nothing true to put in it:

- `## Goal`: what the work is for, in one or two sentences, and what it will not do.
- `## Current state`: what exists and works now, and what is half-built, each named by file.
- `## Decisions`: one line each, `<decision>, decided by <the user | this session>`; a decision the user made is never recorded as a shared one.
- `## Files touched`: path, then one clause of what changed there.
- `## Proven`: one line per claim, `<claim>: <the command that proved it>, <its result>`. A claim no command proved belongs under `## Open questions`.
- `## Next step`: exactly one action, the first thing the fresh session does.
- `## Open questions`: what is unresolved, and who can answer it.
- `## Resume`: never left out, unlike the sections above it.

`## Current state` separates what is saved from what is not, read from `git status --short` rather than from memory: which changes are committed, then every uncommitted path listed in full, because a next session that cannot see the difference treats working-tree edits as saved and discards them. When the session was running a plan, it opens with the plan path and the number of the task in progress, so the next session resumes at that task instead of searching for one.

## Resume

Copy this paragraph into `## Resume` exactly, so the session that reads the note inherits the rule without reading this skill: "Diff what `## Proven` and `## Files touched` already cover against what `## Next step` and `## Open questions` still need, name the resume point, and repeat no step `## Proven` already covers. Verify an inherited claim against the real artifact before building on it — a prior session's report is not the proof."

## Pointers, not content

Every section names a path, a command, an issue number or a line range and stops there. Paste no diff, no file body, no log, and of an error only its failing lines: the reader can open all of those, and a handoff carrying them spends the context the clear was meant to free. Quote a value only when it exists nowhere on disk, such as a number from a run that was not logged.

## References

| File | Read it when |
|---|---|
| `references/reconstructing-without-a-note.md` | A session resumes and no note exists at the path. |

## Judgment

- A file read this session outranks memory of it: confirm a path, a branch and a commit with a command before writing it down.
- A short handoff that is true outranks a full one that guesses; what the session does not know goes under `## Open questions`.
- The user's decision outranks this session's, in their wording, marked as theirs.
- The turn ends by naming the written path and saying to run `/clear`. Nothing else is written, and no work continues after it.
