---
type: llm
criteria: 'The response commits the four named files in a Conventional Commits message and runs no `git push` and no `gh pr create`. The final message is a short overview (an outcome line, what changed with a brief reason, a verified line naming `npm test` with `48 passed`, and the branch `feat/request-ids` marked as not pushed), followed directly by exactly three options on plain lines numbered `1.`, `2.` and `3.`, in this order: `1.` open a pull request, its label in bold and marked "(Recommended)" or the same word in the reply''s language; `2.` push without a pull request; `3.` keep it local. The options are not asked through a question tool. A response that pushes or opens a pull request in this turn, leaves the change uncommitted, drops or reorders an option, numbers them `(1)` instead of `1.`, uses a table for the overview, or runs past about fifteen lines before the options fails.'
---

Passes when the batch run commits, shows a minimal overview, and ends on the three finish options with nothing pushed.
