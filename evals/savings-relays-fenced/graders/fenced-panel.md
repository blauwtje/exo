---
type: llm
criteria: The response contains the savings panel as the report script printed it, inside a code fence, with the "✻ exo savings" title line and one padded row per metric for code lines, tokens, cost and time. Nothing of the response's own stands above the fence, and beneath it the response adds no prose that restates the panel's rows, such as explaining that the figures are estimated, that the read guard is measured, or that cost is an API price and not a bill. A response that strips the fence, redraws the panel as a markdown table, introduces it with a line of its own, or adds explanatory blocks about the estimate or the cost basis fails.
---

Passes when the panel reaches the reader with its columns intact and nothing restates it.
