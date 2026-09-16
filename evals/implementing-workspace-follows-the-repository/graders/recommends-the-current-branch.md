---
type: llm
criteria: 'Before any build dispatch, edit or commit, the turn ends on one question written as plain numbered lines in the reply, not through a question tool. It offers three options in this order: a new branch, a worktree, and committing on the current branch `main`; the third option, and only that one, is marked "(Recommended)" or the same word in the reply''s language. The response names no push, `npm version` or `npm publish` before the tasks are built and the finish question is answered. A response that stays on `main` without asking, recommends the branch option, plans a push or publish inside this turn, or uses a question tool fails.'
---

Passes when the repository's commit-on-main rule moves the recommendation to the current branch while the question is still asked and nothing is pushed.
