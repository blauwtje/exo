---
name: gate
description: "Use when a plan's tasks are landed and its branch needs the gate before a pull request: the plan's checks and one branch review. Not for landing a task (build) or a change with no plan."
context: fork
agent: exo:orchestrator
argument-hint: "[plan path] [--land]"
model: opus
effort: medium
---

# Gate

The gate readies a branch for a pull request.

## The loop

1. **Find the plan.** No plan file → end the turn: ask for its path and name `build`'s no-plan route; run no check by hand.
2. **Run the checks.** `node "${CLAUDE_SKILL_DIR}/scripts/verify.mjs" --plan <plan path> --root <checkout>` once, in the background, to a log; read only its `PASS` and `FAIL` lines.
   - On any `FAIL` line, edit nothing, rerun nothing: end the turn with the `FAIL` lines and hand back to `exo:build`.
3. **Review the branch.** Only with all `PASS`, dispatch `exo:review-branch` once and read its findings file.
   - A `defect` finding goes back to `exo:build`, never fixed in the gate.
4. **Offer the finish.** End on `ship`, unless a request or plan rules out a push; then say nothing left the machine.
   - `--land` → pass `--land` to `ship`.

## References

| File | Read it when |
|---|---|
| `../../lib/references/closing.md` | Final message. |

Report: the report rule in plain words: whether the branch is ready, any open `question` findings, and what the user does next.
