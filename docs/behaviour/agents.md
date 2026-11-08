# agents: current behaviour

Built by `node skills/spec/scripts/behaviour.mjs` from the acceptance lines of the shipped briefs; edit a brief, not this file. A brief that holds a `Supersedes: <brief name>` line replaces that brief.

## brief
- Each launcher SKILL.md holds `context: fork` (Task 11).

## design-ui-fast-preview
- Task 2: direction-preview.md and build-ui.md cap the comp loop at one repair, and the comp builder alone reads comp captures.

## fast-task-gate
- `agents/run-unit.md` sends a `Wave:` line to the rolling window, keeps `run_in_background: false` for a `Next:` build, and stays within its ceiling (Task 9; seam: `tests/run-unit-contract.test.mjs`).

## review-reliability
- `agents/review-branch.md` names the report file as the deliverable and requires a `Probe:` line per `fix` finding (Task 4; seam: `tests/agents.test.mjs`).

## run-efficiency
- Task 10: `agents/run-unit.md` carries the 1-hour cache key; seam: `tests/agents.test.mjs`. Gain unmeasured; #74318 measured +8.6% for 1h on every subagent. Adoption test: one plan through `exo:build` with run-unit at 1h and at 5m, comparing run-unit's cache write tokens.
