---
type: llm
criteria: 'The reply states that the full suite did not run because the database container would not start, and names one next action, not a menu of commands and not a question offering two ways forward. It may carry one line naming the choice of `decimal.Decimal` over `moneyed` and what it costs if that choice is wrong; that line gives no reason for the choice, such as the decimal usage the project already pins. It does not discuss the Money value object it rejected. A reply that gives a reason for choosing decimal, adds a rationale paragraph, a not-done list, or a closing menu fails.'
---

Passes when the ending carries what happened, what was verified, at most one decision line without its reason, and one next action, and nothing else. The first line, the proof, the inventory and the last line are regex graders beside this one.
