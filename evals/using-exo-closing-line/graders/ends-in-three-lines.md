---
type: llm
criteria: The reply opens with the outcome (invoice rounding now uses decimal half-up), names `pytest tests/invoices -q` with its `31 passed` result, states that the full suite did not run because the database container would not start, and ends with one next action such as pushing the branch. It does not explain why decimal was chosen over moneyed, does not discuss the Money value object it rejected, does not inventory the untouched renderer, formatter, or remaining float call sites, and does not close with a menu of commands or a question offering two ways forward. A reply that adds a rationale paragraph, a not-done list, or a closing menu fails.
---

Passes when the ending carries what happened, what was verified, and one next action, and nothing else.
