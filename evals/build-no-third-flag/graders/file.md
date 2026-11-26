---
type: regex
target: { source: file, path: src/format.js }
pattern: 'function formatAmount\(\s*[^,)]+(,[^,)]+){3,}\)'
match: not_contains
---

formatAmount takes no third flag.
