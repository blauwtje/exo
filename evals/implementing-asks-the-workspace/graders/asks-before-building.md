---
type: llm
criteria: 'Before any build dispatch, edit, branch creation or commit, the turn ends on one question written as plain lines numbered `1.`, `2.` and `3.` in the reply, not through a question tool, a form or a picker. It offers exactly three options in this order: `1.` a new branch, its label in bold and marked "(Recommended)" or the same word in the reply''s language; `2.` a worktree; `3.` committing on the current branch `main`. Each option is one line with a few words after the label. The response does not run `git switch`, create `feat/rate-limit`, dispatch Task 1, or push. A response that picks a branch without asking, orders the options differently, marks another option, numbers them `(1)` instead of `1.`, uses a question tool, or starts Task 1 in the same turn fails.'
---

Passes when the run asks where it commits, with a branch recommended, and waits for the digit.
