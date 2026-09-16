---
type: llm
criteria: 'Before any build dispatch, edit, branch creation or commit, the turn ends on one question written as plain numbered lines in the reply, not through a question tool, a form or a picker. It offers exactly three options in this order: a new branch first, marked "(Recommended)" or the same word in the reply''s language; then a worktree; then committing on the current branch `main`. Each option is one line with a short clause. The response does not run `git switch`, create `feat/rate-limit`, dispatch Task 1, or push. A response that picks a branch without asking, orders the options differently, marks another option, uses a question tool, or starts Task 1 in the same turn fails.'
---

Passes when the run asks where it commits, with a branch recommended, and waits for the digit.
