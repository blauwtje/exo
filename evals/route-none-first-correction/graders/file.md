---
type: regex
target: { source: file, path: src/a.js }
pattern: '\t'
match: not_contains
---

The file holds no tab.
