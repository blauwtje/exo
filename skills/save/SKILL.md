---
name: save
description: "Writes a handoff file for unfinished work and reads it back in a fresh session. Use when the user asks to save, pause or hand off this session, or to continue from a saved handoff ('save this session', 'pause this session', 'continue where I left off'). Not for finished work."
argument-hint: "[what the next session must not lose]"
---

## Principles

- Freeze only what this session knows and the next cannot rebuild, because a fresh session pays again for every pasted line.
- Point to files and commands, never paste a transcript, diff or log, because a paste goes stale.
- Build the progress list from `git status --short`, not memory, because a next session that cannot tell committed from uncommitted work discards edits.
- Push nothing and open no pull request, because saving is not shipping.

## Steps

1. Read `${CLAUDE_PLUGIN_ROOT}/BASE.md`.
2. Finish or undo the step in progress; start no new work.
3. Pick the handoff file `<scratch>/handoff-<topic>.md`, with a short kebab-case `<topic>`, and create its folder.
4. On a plan's run branch, commit nothing: save the partial work of the task in progress with `git diff > <scratch>/handoff-<topic>-task<n>.patch` and list the patch under Progress.
5. On any other non-default branch, commit every uncommitted edit as one `chore: wip <topic>` commit, and say in its body if the tree is broken.
6. On the default branch, leave edits uncommitted and list them under Progress.
7. Write the file whole over an older one, in plain words in the user's language, with these parts in order:
   - One line on where the work stands and the first thing to do next, then a line `Written: <date>, branch <branch>, commit <short sha>`.
   - `## Goal`: what the work is for, and what it will not do.
   - `## Progress`: open with the plan path and task number when a plan runs. List what is committed, then every uncommitted path in full. Add each decision with who decided it.
   - `## Evidence`: what is proven, as claim, command and result, and what is unproven or open.
   - `## Ruled out`: each approach dropped, with why it failed.
   - `## Next step`: the first action, then each later step with its full command.
8. End the turn by naming the written path and telling the user to run `/clear`, then say "continue from the handoff". Continue no work.
9. To continue, read `<scratch>/handoff-<topic>.md`, the newest `handoff-*.md` there when no topic is named. With no file, say so and write nothing.
10. Run `git log --oneline <Written commit>..HEAD` and `git status --short`, and name what changed since the handoff before relying on any claim in it.
11. Name the resume point from what the handoff lists as next, and repeat no step it records as proven. Verify an inherited claim against the real artifact, because a prior report is not proof.
