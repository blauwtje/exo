---
type: regex
pattern: '(^|\n)1\. \*\*[^\n]+\((Recommended|Aanbevolen)\)\*\*: '
match: contains
---

Passes when the message puts a question in the chat whose first option is the recommended one.
