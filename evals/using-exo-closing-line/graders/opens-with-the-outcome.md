---
type: regex
pattern: '^\s*[^\n]*(ROUND_HALF_UP|half[- ]up)'
flags: i
match: contains
---

Passes when the first line of the reply states the outcome: invoice rounding now rounds half-up.
