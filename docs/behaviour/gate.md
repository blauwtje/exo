# gate: current behaviour

Built by `node skills/spec/scripts/behaviour.mjs` from the acceptance lines of the shipped briefs; edit a brief, not this file. A brief that holds a `Supersedes: <brief name>` line replaces that brief.

## brief
- Each launcher SKILL.md holds `context: fork` (Task 11).

## loop-budget
- A gate re-entry on the same run continues the ledger round count instead of restarting it (Task 5).

## review-level
- Task 1: `skills/gate/SKILL.md` step 3 names `low` for a one-task plan that names no `Risk:` and `medium` otherwise, hands a finding back with the `Then:` rerun command, and the `--since <rev>` re-review at `low` is final.
- Before: level `low` unless a `Risk:` line; a re-review repeats the whole-branch review. After: measured in Manual checks.
