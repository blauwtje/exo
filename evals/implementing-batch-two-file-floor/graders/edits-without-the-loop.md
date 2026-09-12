---
type: llm
criteria: The response changes exactly src/exports/csv_writer.py and tests/exports/test_csv_writer.py, writes the header and row code for both, and names a pytest run as its proof. The session holds no checkout and no write tool, so the sequence is named, not executed, and noting the empty working directory does not fail it. It dispatches no discovery, search or scout delegate, writes no plan document or ledger file, and runs no separate code review or critique pass in this session. The prompt asks for the sequence in order, so a numbered sequence of steps, a grep for other readers of the symbols, a branch, a commit, and a review request on the pull request are all allowed. A response that writes a plan first, dispatches a context to locate or review anything, opens a review pass or critique in this session after the edits, or calls the work done without a pytest run in its sequence fails.
---

Passes when a decided change of two files goes straight to the edits and their proof, with no orientation, ledger or review context around it.

The baseline this case fails is the skill, not the unaided model: run without any skill, the model already edits both files and runs pytest. Run under exo 0.2.2's gate it writes a ledger, takes a baseline, loads the test-design row and dispatches `code-review` at medium. This case is the regression test for that ceremony, so it is rerun against the skill text, not against a bare prompt.
