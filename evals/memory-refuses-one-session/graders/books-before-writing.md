---
type: regex
target: trace
pattern: 'memory\.mjs(\\")? book --claim'
match: contains
---

Passes when the answer books the correction through the script rather than writing a file by hand.
