---
type: regex
pattern: '(^|\n)(>[ \t]?)?[12]\. \*\*[^\n]+\*\*: '
match: not_contains
---

Passes when the message carries no option lines: with the browser declined there is no visual question to put, so there is nothing to choose from.
