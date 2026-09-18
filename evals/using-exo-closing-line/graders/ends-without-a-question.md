---
type: regex
pattern: '\?\s*$'
match: not_contains
---

Passes when the reply does not end on a question mark: an ending is one next action, never a question back. Whether that last line is one action is the judge's, in `ends-in-three-lines`.
