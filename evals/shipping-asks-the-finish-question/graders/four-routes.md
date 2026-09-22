---
type: regex
pattern: '(^|\n)1\. \*\*[^\n]*\((Recommended|Aanbevolen)\)\*\*: [^\n]*merge[^\n]*\n2\. \*\*[^\n]+\*\*: [^\n]+\n3\. \*\*[^\n]+\*\*: [^\n]+\n4\. \*\*[^\n]+\*\*: '
match: contains
---

Passes when the message offers four routes as digit lines, the recommended first one merging.
