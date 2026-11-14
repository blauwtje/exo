---
name: gate
description: "Use when a plan's tasks are landed and its branch needs the gate before a pull request: the plan's checks and one branch review. Not for landing a task (build) or a change with no plan."
context: fork
agent: exo:orchestrator
argument-hint: "[plan path] [--land] [--recheck]"
model: opus
effort: medium
---

# Gate

The gate readies a branch for a pull request.

## The loop

1. **Find the plan.** No plan file → end the turn: ask for its path and name `build`'s no-plan route; run no check by hand.
2. **Run the checks.** `node "${CLAUDE_SKILL_DIR}/scripts/verify.mjs" --plan <plan path> --root <checkout>` once, in one foreground call with Bash timeout 600000; it appends each check's output to `.exo/logs/gate-verify.log` and prints only `PASS` and `FAIL` lines, each `FAIL` naming that log.
   - On any `FAIL` line, edit nothing, rerun nothing: end the turn with the `FAIL` lines; with `--recheck` that is final, else hand back to `exo:build`.
3. **Review the branch.** Skip with `--recheck`. Only with all `PASS`, call the built-in `code-review` skill once through the Skill tool with args `<level> <branch>`: `low` when the plan has one task and names no `Risk:`, else `medium`; the branch is required.
   - A finding ends the turn with the findings and the line `Then: fix once, then gate <plan path> --recheck`, with `--land` when given; nothing is fixed in the gate.
   - With no `code-review` skill listed, say no review ran and still offer `ship`.
4. **Offer the finish.** End on `ship`, unless a request or plan rules out a push; then say nothing left the machine.
   - `--land` → pass `--land` to `ship`.

## References

| File | Read it when |
|---|---|
| `../../lib/references/closing.md` | Final message. |

Report: the report rule in plain words: whether the branch is ready, the review findings, and what the user does next.
