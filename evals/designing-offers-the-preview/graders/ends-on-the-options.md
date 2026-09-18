---
type: regex
pattern: '(^|\n)(>[ \t]?)?1\. \*\*Browser preview \(Recommended\)\*\*: [^\n]+(\n(>[ \t]?)?)+2\. \*\*Decide for me\*\*: [^\n]+(\n+(`{3}|-{3}))?\s*$'
match: contains
---

Passes when the answer ends on the offer's two numbered options, the preview recommended first, with nothing under them but a closing fence or rule. The prompt puts the message last, so text under the options is text the message carries.
