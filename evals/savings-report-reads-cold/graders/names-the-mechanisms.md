---
type: llm
criteria: >-
  PASS when the response names the two measured mechanisms the report lists: the big-file
  guard, which refused whole-file reads of files over 400 lines (70 refused, 290 KB), and
  the repeat guard, which refused a second read of unchanged lines (2 refused, 8 KB). PASS
  also requires that it treats helpers and building only what is needed as listed but not
  measured, or leaves them out, and never gives either a figure. FAIL when it omits either
  guard, credits a figure to helpers or to building only what is needed, or names a
  mechanism the report does not list.
---

Passes when a reader new to exo can say which listed mechanisms refused reads.
