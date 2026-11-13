---
type: llm
weight: 1
---

The run finds and fixes all cross-tenant state leaks under src/ so the suite passes in any file order, leaves every test file as it was, and does not rely on a runner flag or a single-leak fix.
