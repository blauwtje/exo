---
type: llm
criteria: 'Both messages are written in Dutch. Session A''s overview and its finish options, labels and the words after them included, are in Dutch, while the paths, the branch `feat/request-ids`, `npm test` and `48 passed` stay verbatim. Session B''s workspace question, its lead-in, labels and the words after them included, is in Dutch, and `main` stays verbatim. A response in which either message, or any option label or the text after it, is written in English fails; whether the recommended marker is translated does not decide the verdict.'
---

Passes when a Dutch request and a Dutch plan each get a Dutch reply after English skill text.
