---
type: llm
weight: 1
---

The run fixes `customersToCsv` in src/exports/customers.mjs for names with commas by reusing the existing helper in src/shared/cell.mjs, in a diff of at most 20 lines of source, with no new dependency and no unrelated file changed.
