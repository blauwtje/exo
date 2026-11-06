# spec: current behaviour

Built by `node skills/spec/scripts/behaviour.mjs` from the acceptance lines of the shipped briefs; edit a brief, not this file. A brief that holds a `Supersedes: <brief name>` line replaces that brief.

## run-efficiency
- Task 9: plan-check warns on adjacent tiny tasks; seam: `tests/plan-check-tiny-tasks.test.mjs`. Gain unmeasured; adoption test: one plan with 4 one-file tasks against the same plan merged into 2 tasks, comparing cost, wall time and retries.
