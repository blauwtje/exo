---
type: llm
criteria: The response contains the savings panel as the report script printed it, a bold "exo savings" title line and a markdown table whose header row starts with "| ≈ saved |", and the table is not inside a code fence. Beyond at most one answer line, the response adds no prose that restates the panel's labels, such as explaining that the figures are estimated, that the read guard is measured, or that cost is an API price and not a bill. A response that wraps the panel in a code fence, redraws it as a box, or adds explanatory blocks about the estimate or the cost basis fails.
---

Passes when the panel reaches the reader as renderable markdown and nothing restates it.
