# hooks: current behaviour

Built by `node skills/spec/scripts/behaviour.mjs` from the acceptance lines of the shipped briefs; edit a brief, not this file. A brief that holds a `Supersedes: <brief name>` line replaces that brief.

## plan
- A flow cell on deepseek makes fewer Agent calls at the same score, before/after in a results file (Task 2).
- SessionStart output opens with the static rule text (Task 3).
- Over-limit commands are rewritten, not denied: Task 1. Per-call ms: Task 2.
- Task 2: a subagent's `git stash` runs as a saved patch and never reaches the shared stash list; `git stash pop` is still denied.
- Task 3: a Write whose only break is added comment lines lands with those lines stripped; a nested ternary is still refused.
- Task 4: an Agent brief that names paths but lacks `Reads:` gets those paths as its `Reads:` line; a brief naming none is still refused.
- Success criterion: `npm run check` ends `FAIL=0 WARN=0 UNRUN=0`.

## issues-115-117
- Task 1: `taskReviewer` returns `none (output only, test covered)` for `['skills/x/scripts/a.mjs', 'tests/a.test.mjs']` with an output-only diff, the light pick for `skills/x/SKILL.md`, `hooks/hooks.json` and `.claude/skills/x/SKILL.md`, and the light pick for a non-output script diff under `skills/`; seam: `tests/pick-reviewer.test.mjs`.
