# Reconstructing without a note

Rebuild working context from what git and the forge hold; never ask the user to retell what the repository records.

## Read the trail

1. Branch and worktree first: `git status`, `git log --oneline -20` and `git diff <base>...HEAD` name what shipped and what the branch was for. A branch name naming a ticket or feature is itself a clue.
2. Open trail: `gh pr view` on the current branch, and `gh issue list` or `gh pr list` scoped to the branch or its topic, surface description, checklist and review comments a note would have restated.
3. What a handoff would have listed: `git status --short` and `git diff` name every uncommitted edit.

## Judgment

- Fact read from git or the forge outranks one inferred from branch name or commit subjects alone.
- Result feeds a new note → gap the trail does not cover is an open question, not a fact under `## Current state`.
