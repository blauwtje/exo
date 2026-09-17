---
type: llm
criteria: >-
  PASS when the response names both read-guard mechanisms from the report as two separate
  things, in any wording: the big-file guard, which refuses a whole-file read of a long
  file, and the repeat guard, which refuses a second read of lines already read. Their
  figures are not required. Mentioning anything else, such as helpers, building only what
  is needed, skill loading, re-reads or the prompt cache, neither passes nor fails this
  criterion. FAIL only when the response leaves out either guard, or treats the refusals
  as one undivided guard without naming the refusal of repeated lines.
---

Passes when a reader new to exo can name the big-file guard and the repeat guard as the mechanisms that refused reads.
