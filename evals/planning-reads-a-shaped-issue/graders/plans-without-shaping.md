---
type: llm
criteria: 'The response reads issue 42 with `gh issue view`, treats its body as a settled brief, and plans from it: it does not invoke `shaping`, does not reopen the three decisions as questions, and writes no separate spec file. The plan''s `## Goal` line names `#42`. A response that runs shaping, asks the user to confirm the decisions, or writes `docs/specs/` first fails.'
---

Passes when a marked issue goes straight to planning and the plan names the issue it closes.
