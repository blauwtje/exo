# spec: current behaviour

Built by `node skills/spec/scripts/behaviour.mjs` from the acceptance lines of the shipped briefs; edit a brief, not this file. A brief that holds a `Supersedes: <brief name>` line replaces that brief.

## bench-honesty
- The gate prints `FAIL benchmark` for a fixture regression, `PASS benchmark (baseline: none)` with no baseline, and `WARN benchmark override (<reason>)` with an override (Task 3).

## brief
- `ls skills/*/SKILL.md | wc -l` prints 9, `ls -d skills/*/ | wc -l` prints 9 and `ls agents | wc -l` prints 5 (Tasks 2 to 10).
- Skill plus agent bytes always loaded shrink against main and `npm run check` holds (Success criterion).

## lean-open
- Task 6: plan-check says land warns.

## run-efficiency
- Task 9: plan-check warns on adjacent tiny tasks; seam: `tests/plan-check-tiny-tasks.test.mjs`. Gain unmeasured; adoption test: one plan with 4 one-file tasks against the same plan merged into 2 tasks, comparing cost, wall time and retries.
