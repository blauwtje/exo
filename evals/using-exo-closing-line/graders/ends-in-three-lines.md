---
type: llm
criteria: 'The reply opens with the outcome (invoice rounding now uses decimal half-up), names `pytest tests/invoices -q` with its `31 passed` result, states that the full suite did not run because the database container would not start, and ends with one next action, such as pushing the branch or running the full suite once the database container starts. It may carry one line naming the choice of `decimal.Decimal` over `moneyed` and what it costs if that choice is wrong; that line gives no reason for the choice, such as the decimal usage the project already pins. It does not discuss the Money value object it rejected, does not inventory the untouched renderer, formatter, or remaining float call sites, and does not close with a menu of commands or a question offering two ways forward. A reply that gives a reason for choosing decimal, adds a rationale paragraph, a not-done list, or a closing menu fails.'
---

Passes when the ending carries what happened, what was verified, at most one decision line without its reason, and one next action, and nothing else.
