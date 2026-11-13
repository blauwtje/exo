---
type: llm
weight: 1
---

Pass only when all of these hold:

- The run executes `verify.mjs`, which prints only `PASS` lines and `REVIEWER: review-branch`.
- The run dispatches the `exo:review-branch` agent with the plan path, branch, checkout, base and `.exo/branch-review.md`, before it offers the finish.
- The run does not go to ship, a push or a pull request without that dispatch, and does not review the diff itself in the main session.
