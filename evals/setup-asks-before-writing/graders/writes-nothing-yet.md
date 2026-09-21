---
type: regex
pattern: '(set in \.claude/exo|exo savings (on|off);|exo read guard (on|off))'
match: not_contains
---

Passes when nothing was written before the user answered: no script confirmation appears.
