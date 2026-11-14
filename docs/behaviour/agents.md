# agents: current behaviour

Built by `node skills/spec/scripts/behaviour.mjs` from the acceptance lines of the shipped briefs; edit a brief, not this file. A brief that holds a `Supersedes: <brief name>` line replaces that brief.

## aie-round2
- Task 3: the reviewer line exists.

## brief
- Each launcher SKILL.md holds `context: fork` (Task 11).

## design-ui-fast-preview
- Task 2: direction-preview.md and build-ui.md cap the comp loop at one repair, and the comp builder alone reads comp captures.

## fast-task-gate
- `agents/run-unit.md` sends a `Wave:` line to the rolling window, keeps `run_in_background: false` for a `Next:` build, and stays within its ceiling (Task 9; seam: `tests/run-unit-contract.test.mjs`).

## karpathy-level
- Wish 4, context: worker return cap 40 -> 10 lines (Task 3); spec research workers 8 -> 4 (Task 3); subagent returns 25.3k tokens per spec session (15.0%) before, measured after with `measure-context.mjs` on the first spec session that runs the new exo.
- Wish 3 and 5: traits passed out of the 8 in decision 12 before and after (Task 5); tracked files and lines before and after with `git ls-files | wc -l` and `git ls-files -z | xargs -0 cat | wc -l` (Tasks 2 and 6); agents' review text 36 lines -> claims-only in `agents/review-branch.md` (Task 2).

## review-reliability
- `agents/review-branch.md` names the report file as the deliverable and requires a `Probe:` line per `fix` finding (Task 4; seam: `tests/agents.test.mjs`).

## run-efficiency
- Task 10: `agents/run-unit.md` carries the 1-hour cache key; seam: `tests/agents.test.mjs`. Gain unmeasured; #74318 measured +8.6% for 1h on every subagent. Adoption test: one plan through `exo:build` with run-unit at 1h and at 5m, comparing run-unit's cache write tokens.
