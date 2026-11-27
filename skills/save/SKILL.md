---
name: save
description: "Writes a handoff for unfinished work and resumes it in a fresh session. Use when the user asks to save, pause or hand off, or says 'continue where I left off'. Not for finished work."
argument-hint: "[what the next session must not lose]"
---

# Save

**Write down only what the next session cannot rebuild.** A fresh session reads every line you leave, so a pasted diff, log or transcript costs it context and goes stale. Point to files and commands instead. Build the progress list from git, not from memory: a next session that cannot tell committed from uncommitted work throws edits away.

Saving is not shipping: push nothing and open no pull request.

## Save

1. Finish or undo the step in progress. Start no new work.
2. Pick `<scratch>/handoff-<topic>.md`, with a short kebab-case topic.
3. Keep the edits safe, by branch:
   - **A plan's run branch:** commit nothing. Save the task in progress with `git diff > <scratch>/handoff-<topic>-task<n>.patch`, and list the patch under Progress.
   - **Another branch that is not the default:** commit every edit as one `chore: wip <topic>` commit, and say in its body when the tree is broken.
   - **The default branch:** leave the edits uncommitted and list them under Progress.
4. Write the file whole, over an older one, in the user's language, in this layout:

```markdown
Task 3 of 5 is half done; next, make the header test pass.
Written: 2026-11-27, branch feat/csv-export, commit a1b2c3d

## Goal
CSV export of orders. Not: Excel files.

## Progress
Plan docs/specs/csv-export.md, task 3. Committed: tasks 1 and 2.
Uncommitted: src/export.rs, saved in handoff-csv-export-task3.patch.
Decided by the user: semicolon delimiter.

## Evidence
Proven: cargo test export passes for tasks 1 and 2.
Open: cargo test one_header still fails with 3 headers.

## Ruled out
Writing the header after the loop: rows stream out before the loop ends.

## Next step
1. git apply <scratch>/handoff-csv-export-task3.patch
2. cargo test one_header
3. Run `exo:build` from task 3.
```

5. Name the path, and tell the user to run `/clear` and then say "continue from the handoff". Do no more work.

## Resume

1. Read `<scratch>/handoff-<topic>.md`, or the newest `handoff-*.md` there when no topic is named. With no file, say so and write nothing.
2. Run `git log --oneline <written commit>..HEAD` and `git status --short`, and name what changed since the handoff before you rely on it.
3. Start from its next step, and repeat no step it records as proven. Check an inherited claim on the real artifact before you build on it: a report from the last session is not proof.
