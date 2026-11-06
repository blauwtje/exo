# benchmarks: current behaviour

Built by `node skills/spec/scripts/behaviour.mjs` from the acceptance lines of the shipped briefs; edit a brief, not this file. A brief that holds a `Supersedes: <brief name>` line replaces that brief.

## design-ui-fast-preview
- Task 6: `node --test tests/benchmark-design-run.test.mjs` passes with `firstPreviewMs` asserted for a sketch run, a picker run and a run with neither.

## run-efficiency
- Tasks 3-5: a headless build session's prompt names no `Report to:` file (Task 5), and `run-plan.mjs` writes the reply text above the last line to `.exo/implementer-<n>.md` before landing (Task 4); seams: `tests/run-plan-red-repair.test.mjs`, `tests/stall-guard.test.mjs`. Gain unmeasured: `benchmarks/results/2026-10-12-flow-run-4b.md:45` counts 6 of about 9 extra tool calls as report writes. Adoption test: rerun the 4b flow sweep (`flow-base` vs `flow-run`, n=4, `--concurrency 1`, under `caffeinate -i`) and adopt if weighted tokens fall and the hidden check stays 4/4.
