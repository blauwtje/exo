# design-ui: current behaviour

Built by `node skills/spec/scripts/behaviour.mjs` from the acceptance lines of the shipped briefs; edit a brief, not this file. A brief that holds a `Supersedes: <brief name>` line replaces that brief.

## design-ui-fast-preview
- Task 1: sketch-tab.md holds `## The direction round`.
- Task 1: phase-direction `## Rung 3` deals, sketches, waits, then fills, checks and selects the picked contract only.
- Task 1: `## The comps` opens only on the user's words asking for working or live comps.
- Task 2: direction-preview.md and build-ui.md cap the comp loop at one repair, and the comp builder alone reads comp captures.
- Task 3: intake.md holds `## The direction offer` with the sketch-round offer; `node --test tests/question-shape.test.mjs` passes.
- Task 4: SKILL.md routes rung 3 to the sketch round and its rows name the preview and one-pass read sets above; the body stays ≤ 10,000 B.
- Task 5: phase-build.md gives no `COMP` after a sketch pick and limits this session's capture to routes other than the full run.
- Task 7: `node --test tests/design-ui-read-budget.test.mjs` passes. The preview set sums ≤ 30,000 B and the one-pass set ≤ 46,000 B.
- The Success criterion passes on the branch rebased onto `origin/main`.
