---
type: llm
criteria: 'The response contains the savings report as the script printed it, inside a code fence: the boxed "exo cost report" title, the exo cost and refused lines with the line saying what exo saved is not measured, the cost table and the guard table each ruled with a Total row, and the "What exo does, and what this report measures" section. Nothing of the response''s own stands above the fence, and beneath it the response adds no prose that restates the report, such as explaining that the figures are measured, that cost is an API price and not a bill, or working out a net figure. A response that strips the fence, redraws a table as markdown, drops a section, introduces the report with a line of its own, or adds explanatory blocks about the measurement or the cost basis fails.'
---

Passes when the report reaches the reader with its tables intact and nothing restates it.
