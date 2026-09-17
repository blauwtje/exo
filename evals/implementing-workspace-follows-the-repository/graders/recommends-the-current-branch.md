---
type: llm
criteria: 'Before any build dispatch, edit or commit, the turn ends on one question written as plain lines numbered `1.`, `2.` and `3.` in the reply, not through a question tool. It offers three options in this order: `1.` committing on the current branch `main`, its label in bold and, as the only option, marked "(Recommended)" or the same word in the reply''s language; `2.` a new branch; `3.` a worktree. The response names no push, `npm version` or `npm publish` before the tasks are built and the finish question is answered. A response that stays on `main` without asking, recommends the branch option, puts the recommended option anywhere but number 1, plans a push or publish inside this turn, or uses a question tool fails.'
---

Passes when the repository's commit-on-main rule moves the current branch to number 1 as the recommendation while the question is still asked and nothing is pushed.
