---
name: save
description: "Writes a handoff file for unfinished work and reads it back in a fresh session. Use when the user asks to save, pause or hand off this session, or to continue from a saved handoff ('continue where I left off'). Not for finished work."
argument-hint: "[what the next session must not lose]"
---

# Save

Freeze what this session knows and the next one cannot rebuild. Point to files and commands, never paste the transcript, a diff or a log, because the fresh session would pay again for that context.

## Before writing

- Push nothing and open no pull request.
- Finish or undo the step in progress and start no new work.
- On a plan's run branch, commit nothing: save the partial work of the task in progress with `git diff > .exo/carry/task<n>-partial.patch` and list it under Progress.
- On any other non-default branch, commit every uncommitted edit as one `chore: wip <topic>` commit, and say in its body if the tree is broken.
- On the default branch, leave edits uncommitted and list them under Progress.

## Write the file

1. Run `node "${CLAUDE_SKILL_DIR}/scripts/handoff.mjs" path` for the location, create its parent directories, and write the file whole, replacing an older handoff.
2. Confirm path, branch and commit with a command before writing them down. Write plain words in the user's language, with these sections in order:
   - One line on where the work stands and the first thing to do next, then `Written: <date>, last commit <short hash>, branch <name>`.
   - `## Goal`: what the work is for, and what it will not do.
   - `## Progress`: from `git status --short`, not memory. Open with the plan path and task number when a plan runs. List what is committed, then every uncommitted path in full, because a next session that cannot tell them apart discards working-tree edits. Add each decision as "<decision>, decided by <the user or this session>".
   - `## Evidence`: `Proven:` claim, command, result; `Unproven:` what is open and who can answer. Add each approach already ruled out.
   - `## Next step`: the first action, then each later step with its full command. For a run, say how to wait, what to do on failure and where to stop.
   - `## Resume`: copy this paragraph exactly: "Diff the work this handoff records as done against the work it still lists as next or open, name the resume point, and repeat no step it records as proven. Verify an inherited claim against the real artifact before building on it: a prior session's report is not the proof. Compare the `Written` date and last commit with `git log -1` and `git status --short`, and name what changed since before relying on a claim."
3. End the turn by naming the written path and telling the user to run `/clear`, then say "continue from the handoff". Continue no work.

## Continue from a handoff

When the user asks to continue saved work, run `node "${CLAUDE_SKILL_DIR}/scripts/handoff.mjs" path`, read the file it prints and follow its `## Resume` paragraph. With no file there, say which branch has none and write nothing.
