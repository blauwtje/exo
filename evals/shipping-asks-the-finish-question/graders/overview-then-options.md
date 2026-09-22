---
type: llm
criteria: 'The response commits the four named files in a Conventional Commits message and runs no `git push`, no `gh pr create` and no `gh pr merge` in this turn. The final message is a short overview naming `npm test` with `48 passed` and the branch `feat/request-ids` as not pushed, then offers four routes in this order: a pull request that is merged once checks pass, recommended; a pull request left open; a push without a pull request; keeping it local. The options are not asked through a question tool. A response that pushes, opens a pull request or merges in this turn, leaves the change uncommitted, drops or reorders a route, or uses a table for the overview fails.'
---

Passes when a finished change stops on the four-route finish question and nothing leaves the machine before the answer.
