---
name: verify
description: "Use when a plan's tasks are landed and its branch needs the gate before a pull request: the scripted checks, the branch review and its repairs. Not for landing a task (build) or a change with no plan."
argument-hint: "[plan path] [--land]"
---

# Verifying a branch

## The loop

1. **Run the gate.** Run `node "${CLAUDE_SKILL_DIR}/scripts/verify.mjs" --plan <plan path> --root <checkout> --base <base> --reviews-only` first.
   - Then in one message: the full run in the background, step 2's dispatch.
   - No plan file → end the turn: ask for its path, name `build`'s no-plan route; never hand-run checks or `ship`.
   - `SKIP`, `WARN`, `FIX-ONLY` or `SESSION` line → read `references/gate-lines.md`.
   - `FAIL` or `UNPLANNED` line → end the turn with the script's own report; rerun no check.
   - Step 3 starts after the full run prints no `FAIL` or `UNPLANNED`.
2. **Review the branch.** Skip the one `REVIEW Branch` line when its reviewer reads `none`.
   - Else dispatch one `exo:review-branch` agent for it, opening its prompt with `exo-kind: review-deep`, unless the line names no kind.
   - Add one dispatch with scope `overlap` when `OVERLAP` lists more than `none`, all in one message.
   - Then run `node "${CLAUDE_SKILL_DIR}/scripts/merge-reviews.mjs" --root <checkout> --report <each report path>`, each `CODE-RULES` path included; its line is step 3's verdict.
   - Run `node "${CLAUDE_SKILL_DIR}/scripts/pick-reviewer.mjs" --codex`: `offer` → ask once for a `codex exec` second review of the same plan and diff, append its findings to the findings path before step 3; else say nothing.
   - `--land` → skip that offer.
3. **Repair the findings.** `FINDINGS` with `fix=1` or more, or `concern=1` or more, goes to the `exo:fix-review` agent, with no model override, the filled dispatch line, `../build/review-fixer-prompt.md` by path.
   - `concern=1` or more with `fix=0` → still dispatch; the fixer, not the lead, writes each concern's failing test and marks it unproven only when that test passes.
   - `fix=0` and `concern=0` → step 4, no `exo:fix-review` dispatch, rerun or fix commit.
   - Else after the dispatch → `references/repair.md`.
4. **Offer the finish.** End on `ship`, unless a request or plan rules out a push; then say nothing left the machine.
   - `defect` lines in the findings → first book each per `references/lessons.md`.
   - `--land` → pass `--land` to `ship`.

## References

| File | Read it when |
|---|---|
| `references/review-rules.md` | Step 2, each dispatch and each `BLOCKED`: its `## Dispatch` rules. |
| `references/repair.md` | Step 3, after the fixer returns. |
| `references/lessons.md` | Step 4, when the findings hold a `defect`. |
| `references/gate-lines.md` | Step 1, a line its pointer names. |
| `references/plan-checks.md` | Never here: the reviewer reads it. |

Report: `REPORT` file gets `Changed`, chores, `report` findings. Message: the session's report rule, three lines with the `REPORT` path as the pointer, `question` findings, one decision: `FAIL`, else `question`, else `ship`. Say "file outside the plan" for `UNPLANNED`, "unproven risk" for a concern, each with what exo did.
