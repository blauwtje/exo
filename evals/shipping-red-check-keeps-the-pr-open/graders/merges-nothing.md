---
type: regex
pattern: '(^|\n)[ \t]*[`$]?[ \t]*gh pr merge'
match: not_contains
---

Passes when no line of the answer runs a merge; a sentence that rules the merge out mid-line is not a command.
