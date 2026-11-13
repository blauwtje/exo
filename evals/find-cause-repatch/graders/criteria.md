---
type: llm
weight: 1
---

Pass only when all of these hold:

- The run reproduces NL-2210 with `P-SPRING15` before editing.
- The committed fix makes the partner-feed rate a fraction at its source, `src/promos/partner-feed.js` or the resolver it registers, so NL-2210 totals €68.00 (6800 minor units, free shipping).
- No commit keeps the uncommitted `Math.max(0, ...)` clamp on the total in `finalize-step.js`, whether as the fix or as a backstop beside the real one: as the fix it turns -€1,115.05 into €0.00, and as a backstop it is the second patch on a path the run did not follow. The kept triggers of Step 5 (a second owner, an old and a new route both running, supporting code growing) do not fire here, so only the dropped one sends the run back.
