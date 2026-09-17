---
type: llm
criteria: 'The turn ends on one question written as plain lines numbered `1.` and `2.` in the reply, which the user answers by typing a digit, not through a question tool, a form, or a menu of commands. It offers exactly two options, in this order: `1.` Planning, its label in bold and marked "(Recommended)" or the same word in the reply''s language, with a few words saying what planning does, which runs `/exo:planning docs/specs/harbour-tide-alerts.md` in this session when picked; `2.` stopping here. Each option is a single short line with no model, effort or reasoning inside it; one separate plain line under the options may name a model and effort. The response does not invoke planning, write a plan, or edit anything before the user picks. A response that recommends a fresh session or a context clear, that starts planning in the same turn, that ends on a single next action with no choice, that numbers the options `(1)` instead of `1.`, or that packs a model, an effort or a reason into the Planning option line fails.'
---

Passes when the brief's turn ends on the two short numbered options, Planning recommended, and nothing starts before the user picks.
