---
type: llm
criteria: 'The turn ends on one question written as numbered lines in the reply that the user answers by typing a digit, not through a question tool, a form, or a menu of commands. It offers exactly two options, in this order: first, running `/exo:planning docs/specs/harbour-tide-alerts.md` in this session, marked as the recommended one and naming a model and an effort level with a one-clause reason; second, stopping here. The response does not invoke planning, write a plan, or edit anything before the user picks. A response that recommends a fresh session or a context clear, that starts planning in the same turn, that ends on a single next action with no choice, or that offers the planning option without a model and effort fails.'
---

Passes when the brief's turn ends on the choice, recommends continuing here, and nothing starts before the user picks.
