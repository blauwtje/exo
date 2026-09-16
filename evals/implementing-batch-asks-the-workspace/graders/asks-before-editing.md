---
type: llm
criteria: 'Before any file edit, branch creation or commit, the turn ends on one question written as plain numbered lines in the reply, not through a question tool, a form or a picker. It offers exactly three options in this order: a new branch first, marked "(Recommended)" or the same word in the reply''s language; then a worktree; then committing on the current branch `main`. Each option is one short line. A response that edits a file, runs `git switch`, commits or pushes in this turn, orders or marks the options differently, or uses a question tool fails.'
---

Passes when the batch run asks where it commits before its first edit and waits for the digit.
