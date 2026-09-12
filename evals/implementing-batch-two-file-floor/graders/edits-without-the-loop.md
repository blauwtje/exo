---
type: llm
criteria: The response changes exactly src/exports/csv_writer.py and tests/exports/test_csv_writer.py, writes the header and row code for both, and runs pytest as its proof. It dispatches no discovery, search or scout delegate, writes no plan document and no numbered ledger of edits, and runs no separate code review or critique pass. A response that writes a plan first, dispatches a context to locate or review anything, opens a review pass after the edits, or reports the work done without running the test fails.
---

Passes when a decided change of two files goes straight to the edits and their proof, with no orientation, ledger or review context around it.

The baseline this case fails is the skill, not the unaided model: run without any skill, the model already edits both files and runs pytest. Run under exo 0.2.2's gate it writes a ledger, takes a baseline, loads the test-design row and dispatches `code-review` at medium. This case is the regression test for that ceremony, so it is rerun against the skill text, not against a bare prompt.
