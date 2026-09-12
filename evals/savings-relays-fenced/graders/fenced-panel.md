---
type: llm
criteria: The response contains the savings panel as the report script printed it, inside a code fence, with the "✻ exo savings" title line, a header row naming "with exo", "≈ without exo" and "saved", and a rule line per scope drawn with ─ characters. Beyond at most one answer line, the response adds no prose that restates the panel's labels, such as explaining that the figures are estimated, that the read guard is measured, or that cost is an API price and not a bill. A response that strips the fence, redraws the panel as a markdown table, or adds explanatory blocks about the estimate or the cost basis fails.
---

Passes when the panel reaches the reader with its columns intact and nothing restates it.
