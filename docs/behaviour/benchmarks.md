# benchmarks: current behaviour

Built by `node skills/spec/scripts/behaviour.mjs` from the acceptance lines of the shipped briefs; edit a brief, not this file. A brief that holds a `Supersedes: <brief name>` line replaces that brief.

## design-ui-fast-preview
- Task 1: sketch-tab.md holds `## The direction round`.
- Task 1: phase-direction `## Rung 3` deals, sketches, waits, then fills, checks and selects the picked contract only.
- Task 1: `## The comps` opens only on the user's words asking for working or live comps.
- Task 3: intake.md holds `## The direction offer` with the sketch-round offer; `node --test tests/question-shape.test.mjs` passes.
- Task 4: SKILL.md routes rung 3 to the sketch round and its rows name the preview and one-pass read sets above; the body stays ≤ 10,000 B.
- Task 5: phase-build.md gives no `COMP` after a sketch pick and limits this session's capture to routes other than the full run.
- Task 6: `node --test tests/benchmark-design-run.test.mjs` passes with `firstPreviewMs` asserted for a sketch run, a picker run and a run with neither.
- Task 7: `node --test tests/design-ui-read-budget.test.mjs` passes. The preview set sums ≤ 30,000 B and the one-pass set ≤ 46,000 B.
- The Success criterion passes on the branch rebased onto `origin/main`.

## run-efficiency
- Tasks 3-5: a headless build session's prompt names no `Report to:` file (Task 5), and `run-plan.mjs` writes the reply text above the last line to `.exo/implementer-<n>.md` before landing (Task 4); seams: `tests/run-plan-red-repair.test.mjs`, `tests/stall-guard.test.mjs`. Gain unmeasured: `benchmarks/results/2026-10-12-flow-run-4b.md:45` counts 6 of about 9 extra tool calls as report writes. Adoption test: rerun the 4b flow sweep (`flow-base` vs `flow-run`, n=4, `--concurrency 1`, under `caffeinate -i`) and adopt if weighted tokens fall and the hidden check stays 4/4.
