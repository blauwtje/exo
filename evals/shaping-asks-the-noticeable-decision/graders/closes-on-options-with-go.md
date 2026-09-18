---
type: regex
pattern: '(^|\n)(>[ \t]?)?1\. \*\*[^\n*]+ \(Recommended\)\*\*: [^\n]+(\n+(>[ \t]?)?[2-9]\. \*\*[^\n*]+\*\*: [^\n]+)*\n+(>[ \t]?)?[2-9]\. \*\*Go\*\*: [^\n]+(\n+(`{3}|-{3}))?\s*$'
match: contains
---

Passes when the message to the product owner closes on the option lines, the recommended answer as number 1 and Go as the last one, so a digit answers and go is always within reach.
