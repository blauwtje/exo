# Reconstructing without a note

No handoff sits at the path a resuming session was pointed to, so rebuild the working context from what git and the forge already hold. The enemy is asking the user to retell what the repository already records. The overcorrection is inventing a fact the trail does not support instead of naming it unknown.

## Read the trail

1. Read the branch and the worktree first: `git status`, `git log --oneline -20`, and `git diff <base>...HEAD` name what shipped and what the branch was for. A branch name naming a ticket or a feature is itself a clue.
2. Read the open trail: `gh pr view` on the current branch, and `gh issue list` or `gh pr list` scoped to the branch or its topic, surface a description, a checklist and review comments a note would otherwise have restated.
3. Read what a handoff would have listed: `git status --short` and `git diff` name every uncommitted edit.

## Judgment

- A fact read from git or the forge outranks one inferred from the branch name or the commit subjects alone.
- A gap the trail does not cover is an open question, not a fact under `## Current state`, if the result feeds a new note.
