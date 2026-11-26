---
type: regex
target: { source: file, path: src/sum.js }
pattern: ', 1\)'
match: not_contains
---

The sum no longer starts from 1.
