---
name: save-session
description: Use when the user asks to save this unfinished session for a fresh one. Not for a plan another executor runs (spec) or finished work.
argument-hint: "[what the next session must not lose]"
---

# Handoff

Freeze what this session knows and the next one cannot rebuild. The enemy is a handoff that pastes the transcript back, so the fresh session pays again for the context the clear just bought. The overcorrection is a page of headlines naming no file, command or next step, leaving the reader to rediscover the work.

## Before writing

- Take no irreversible action to pause: no push, no pull request.
- Pause between atomic steps, not inside one: complete or undo the step in progress and begin no new work.
- On the run branch of a plan (`exo:build` loop), commit nothing. Write partial work of the task in progress to a hint file such as `.exo/carry/task<n>-partial.patch`, and list it under `## Current state`.
- On any other branch than the repository's default, commit every uncommitted edit first as one `chore: wip <topic>` commit.
- If the tree is broken, say so in that commit's body.
- On the default branch, leave edits uncommitted and list them under `## Current state`.
- Preserve verbatim any artefact the user explicitly asked to survive the clear, such as a question list or checklist.

## Pointers, not content

- Each section names a path, command, issue number or line range, and stops there.
- Paste no diff, file body or log; the reader can open them, and pasting spends the context the clear freed.
- For an error, paste only its failing lines.
- Quote a value only when it exists nowhere on disk, such as a number from an unlogged run.

## Where it goes

1. Read the location instead of guessing it: `node "${CLAUDE_SKILL_DIR}/scripts/handoff.mjs" path` prints it, the same file `hooks/session-start.mjs` points a resuming session at.
2. A branch name holding `/` gives a nested path, so create parent directories first.
3. Write the file whole, replacing any handoff already at that path: the state it held is what this clear discards.

## What it holds

Fill `assets/handoff-template.md`. Its first line answers in one sentence where the work stands, and `## Resume` is always present while the other sections are left out when the session has nothing true for them. The file is read by the user, so write plain words in the user's language per `../route-skills/references/user-read-format.md`.

The last line of the file is `Resume: <prompt>`, one sentence in the user's language telling a fresh session to read this handoff by the path `handoff.mjs path` printed and continue. The sections carry every step, so this one line suffices.

In those sections:

- Record the user's decision as theirs, in their wording, not as shared.
- When a plan is running with `<plan stem>-decisions.md` beside it, carry its lines into `## Decisions` unchanged.
- Put a claim no command proved under `## Open questions`, not `## Proven`.
- Run `node "${CLAUDE_SKILL_DIR}/../../lib/ruled-out.mjs" show <n>` for the task in progress and carry its lines into `## Open questions` as approaches the next session must not retry.
- Read `## Current state` from `git status --short`, not memory.
- List which changes are committed, then every uncommitted path in full, because a next session that cannot see the difference treats working-tree edits as saved and discards them.
- For a session running a plan, open `## Current state` with the plan path and the number of the task in progress.

## Resume

Copy this paragraph into `## Resume` exactly, so the reading session inherits the rule without this skill:

```text
Diff the work this handoff records as done against the work it still lists as next or open, name the resume point, and repeat no step it records as proven. Verify an inherited claim against the real artifact before building on it: a prior session's report is not the proof.
```

## References

| File | Read it when |
|---|---|
| `references/reconstructing-without-a-note.md` | Save-session itself starts without a note and must rebuild context before saving. |

## Judgment

- File read this session outranks memory of it: confirm path, branch and commit with a command before writing them down.
- A short true handoff outranks a full one that guesses. Put what the session does not know under `## Open questions`.
- Turn ends naming the written path, saying to run `/clear`, and quoting the `Resume:` prompt to paste after it. Nothing else written; no work continues after.
