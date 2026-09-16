---
type: regex
pattern: '(^|\n)display: *[^\s][^\n]*\nbody: *[^\s][^\n]*\s*$'
flags: i
match: contains
---

Passes when the reply ends on the two lines that name the committed display and body faces, so the face check below reads them.
