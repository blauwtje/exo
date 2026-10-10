---
name: verify
description: "Use when a plan's tasks are landed and its branch needs the gate before a pull request: the scripted checks, the branch review and its repairs. Not for landing a task (build) or a change with no plan."
argument-hint: "[plan path] [--land]"
effort: high
---

# Verifying a branch

## The loop

1. **Run the gate.** Run `node "${CLAUDE_SKILL_DIR}/scripts/verify.mjs" --plan <plan path> --root <checkout> --base <base>`.
   - No plan file → end the turn: ask for its path, name `build`'s no-plan route; never hand-run checks or `ship`.
   - `SKIP`, `WARN`, `FIX-ONLY` or `SESSION` line → read `references/gate-lines.md`.
   - Then the gate once: the `Success criterion`'s first backticked command, else its `Land gate:`, else `npm run check`, else `npm test` with no `check` script.
   - `FAIL` or `STRAY` line → end the turn with the script's own report; rerun no check.
2. **Review each task.** Skip a `REVIEWED` line and a `REVIEW` line whose reviewer reads `none`.
   - Dispatch one `exo:review-branch` agent per other `REVIEW` line, all in one message, setting `model` and `effort` to the line's `model=` and `effort=` when named, unless the budget rule sets others.
   - Add one dispatch with scope `overlap` when `OVERLAP` lists more than `none`.
   - Each dispatch follows `references/review-rules.md` `## Dispatch`.
   - After resume, `BLOCKED` → end the turn with its report.
   - Then run `node "${CLAUDE_SKILL_DIR}/scripts/merge-reviews.mjs" --root <checkout> --report <each report path>`, `REVIEWED` records included; its line is step 3's verdict.
   - Run `node "${CLAUDE_SKILL_DIR}/scripts/pick-reviewer.mjs" --codex`: `offer` → ask the user once for a `codex exec` second review of the same plan and diff; append its findings to the findings path before step 3; `none` or a decline → say nothing.
   - `--land` → skip that offer.
3. **Repair the findings.** `FINDINGS` with `fix=1` or more goes to the `exo:fix-review` agent, with no model override, the filled dispatch line, `../build/review-fixer-prompt.md` by path.
   - `fix=0` → step 4, no `exo:fix-review` dispatch, rerun or fix commit.
   - After the dispatch → follow `references/repair.md`.
4. **Offer the finish.** End on `ship`, unless a request or plan rules out a push; then say nothing left the machine.
   - `defect` lines in the findings → first book each per `references/lessons.md`; a refused or denied booking blocks nothing.
   - `--land` → pass `--land` to `ship`.

## References

| File | Read it when |
|---|---|
| `references/review-rules.md` | Step 2, each dispatch. |
| `references/repair.md` | Step 3, after the fixer returns. |
| `references/lessons.md` | Step 4, when the findings hold a `defect`. |
| `references/gate-lines.md` | Step 1, a line its pointer names. |
| `references/plan-checks.md` | Never here: the reviewer reads it. |

Report: `REPORT` file gets `Changed`, chores, `report` findings. Message: the session's report rule, three lines with the `REPORT` path as the pointer, `question` findings, one decision: `FAIL`, else `question`, else `ship`.
