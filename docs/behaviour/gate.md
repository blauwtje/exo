# gate: current behaviour

Built by `node skills/spec/scripts/behaviour.mjs` from the acceptance lines of the shipped briefs; edit a brief, not this file. A brief that holds a `Supersedes: <brief name>` line replaces that brief.

## bench-honesty
- The gate prints `FAIL benchmark` for a fixture regression, `PASS benchmark (baseline: none)` with no baseline, and `WARN benchmark override (<reason>)` with an override (Task 3).

## brief
- Each launcher SKILL.md holds `context: fork` (Task 11).

## loop-budget
- A gate re-entry on the same run continues the ledger round count instead of restarting it (Task 5).
