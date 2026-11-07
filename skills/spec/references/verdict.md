# Verdict

The verdict is the first judgment spec makes, before any question or brief. The enemy is a brief for work the repo or an installed tool already does. The overcorrection is a stop on a request that only looks like existing work.

## Steps

1. State `Verdict: go`, `clarify` or `stop`.
2. State `Objection:`, the one reason most likely to make the work fail or not worth doing, backed by code, a settling path or an existing tool.
3. `clarify` asks the one question that would turn it into `go`.
4. `stop` writes no brief. Report the reason and the code or tool that already covers the request.
5. `go` goes on to the questions. Write both lines under a `## Verdict` heading right after `## Goal`.
6. After the brief is stored, run `node "${CLAUDE_SKILL_DIR}/scripts/verdict-check.mjs" --plan <brief file>` and fix what it flags. Show the user the `Objection:` line beside the recommendation.

   - When the diff fits one sentence or code settles every point, ask no question and let exo close each choice.
