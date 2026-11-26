---
type: regex
pattern: '\b(?=[0-9a-f]*[0-9])[0-9a-f]{7,40}\b|\b(LANDED|BLOCKED|wave)\b'
match: not_contains
---

The reply holds no commit hash and none of the words LANDED, BLOCKED and wave.
