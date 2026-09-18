---
type: regex
pattern: '(^|\n)(>[ \t]?)?Repository: `?/home/dev/sinter\b[\s\S]*?\n(>[ \t]?)?Branch: `?main\b'
match: contains
---

Passes when the plan basis carries `Repository: /home/dev/sinter` and, below it, `Branch: main`, each starting its own line. A quote mark before the line, backticks around the value and words after it do not fail it, because `implementing` matches the line by reading it.
