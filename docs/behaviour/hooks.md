# hooks: current behaviour

Built by `node skills/spec/scripts/behaviour.mjs` from the acceptance lines of the shipped briefs; edit a brief, not this file. A brief that holds a `Supersedes: <brief name>` line replaces that brief.

## plan
- A flow cell on deepseek makes fewer Agent calls at the same score, before/after in a results file (Task 2).
- SessionStart output opens with the static rule text (Task 3).

## issues-115-117
- Task 1: `taskReviewer` returns `none (output only, test covered)` for `['skills/x/scripts/a.mjs', 'tests/a.test.mjs']` with an output-only diff, the light pick for `skills/x/SKILL.md`, `hooks/hooks.json` and `.claude/skills/x/SKILL.md`, and the light pick for a non-output script diff under `skills/`; seam: `tests/pick-reviewer.test.mjs`.
