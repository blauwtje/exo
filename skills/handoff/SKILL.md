---
name: handoff
description: "Save an unfinished session's live state to a file a fresh session reads after a clear: goal, current state, decisions and who made them, what is proven, the single next step. Use when the user invokes it. Not for a plan another executor runs, which planning owns, and not for finished work, which the commit and the pull request record."
argument-hint: "[what the next session must not lose]"
disable-model-invocation: true
---

# Handoff

Freeze what this session knows and the next one cannot rebuild. The enemy is the handoff that pastes the transcript back, so the fresh session pays again for the context the clear just bought. The overcorrection is a page of headlines naming no file, no command and no next step, leaving the reader to rediscover the work.

## When to use

- The user invokes it: the work is unfinished and the context is about to be cleared.
- Not for work another executor runs from a specification: that is a plan, and `planning` owns it.
- Not for finished work: the commit, the pull request and the changelog record that.

## Where it goes

1. Read the location, never guess it: `git rev-parse --git-dir` gives the directory and `git rev-parse --abbrev-ref HEAD` the branch, and the file is `<git-dir>/exo/handoff/<branch>.md`. Nothing under that directory is committed, and a linked worktree has one of its own, so a handoff cannot follow the wrong branch.
2. A branch name holding `/` makes a nested path: create the parent directories first. A detached HEAD writes `HEAD.md`.
3. Outside a git repository the file is `~/.claude/exo/handoff/<folder-name>.md`, the folder being the working directory's own name, under `CLAUDE_CONFIG_DIR` when that variable is set.
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

`## Current state` separates what is saved from what is not, read from `git status --short` rather than from memory: which changes are committed, then every uncommitted path listed in full, because a next session that cannot see the difference treats working-tree edits as saved and discards them. When the session was running a plan, it opens with the plan path and the number of the task in progress, so the next session resumes at that task instead of searching for one.

## Pointers, not content

Every section names a path, a command, an issue number or a line range and stops there. Paste no diff, no file body, no log, and of an error only its failing lines: the reader can open all of those, and a handoff carrying them spends the context the clear was meant to free. Quote a value only when it exists nowhere on disk, such as a number from a run that was not logged.

## Judgment

- A file read this session outranks memory of it: confirm a path, a branch and a commit with a command before writing it down.
- A short handoff that is true outranks a full one that guesses; what the session does not know goes under `## Open questions`.
- The user's decision outranks this session's, in their wording, marked as theirs.
- The turn ends by naming the written path and saying to run `/clear`. Nothing else is written, and no work continues after it.
