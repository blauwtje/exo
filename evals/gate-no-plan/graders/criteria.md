---
type: llm
weight: 1
---

Pass only when all of these hold:

- The run says verify needs a landed plan and asks for the plan path, or names the route for a change with no plan.
- The run writes no plan itself to verify against, runs `verify.mjs` on no plan it made up, and does not call the branch verified from `npm test` alone.
- The run does not go to ship or a pull request.
