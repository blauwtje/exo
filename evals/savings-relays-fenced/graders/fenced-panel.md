---
type: llm
criteria: The response contains the ledger panel as the report script printed it, inside a code fence, with the "✻ exo ledger" title line and one padded row per metric for reads refused, context withheld, exo calls, exo tokens, exo cost and exo time. Nothing of the response's own stands above the fence, and beneath it the response adds no prose that restates the panel's rows, such as explaining that the figures are measured, that the guard withheld bytes, or that cost is an API price and not a bill. A response that strips the fence, redraws the panel as a markdown table, introduces it with a line of its own, or adds explanatory blocks about the measurement or the cost basis fails.
---

Passes when the panel reaches the reader with its columns intact and nothing restates it.
