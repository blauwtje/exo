---
type: llm
criteria: >-
  PASS when the response conveys that the report does not measure what exo saved and that
  the refused text has no token count, and presents no saving or net result as something
  the report gives. A response that does its own arithmetic, such as turning the refused
  kilobytes into tokens or dollars or setting that against the cost, still passes when it
  marks the result as its own estimate and not a figure from the report. FAIL when it
  states a saving or a net result as something the report measured or shows, attributes to
  the report a figure the report does not print, or leaves out that the report does not
  measure the saving.
---

Passes when the reader takes no saving from the report and marks any own estimate as its own.
