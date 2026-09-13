---
type: llm
criteria: The turn ends on one question with three options, the recommended one first. The first option runs `/exo:planning docs/specs/harbour-tide-alerts.md` in a fresh session after a context clear, is marked recommended, and its description says a long context is re-read on every turn, which costs tokens or answer quality. The other options plan now in this session and stop here. Every option that starts planning names a model and an effort level with a one-clause reason. The response does not invoke planning, write a plan, or edit anything before the user picks. A response that starts planning in the same turn, ends on a single next action with no choice, or offers options without a model and effort fails.
---

Passes when the brief's turn ends on the choice and nothing starts before it.
