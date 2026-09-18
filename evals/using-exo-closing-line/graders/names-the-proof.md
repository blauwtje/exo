---
type: regex
pattern: '^(?=[\s\S]*pytest tests/invoices -q)(?=[\s\S]*31 passed)'
match: contains
---

Passes when the reply names the command that proves the change, `pytest tests/invoices -q`, and its `31 passed` result.
