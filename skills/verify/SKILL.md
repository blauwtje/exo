---
name: verify
description: "Use when a plan's tasks are landed and its branch needs the gate before a pull request: the scripted checks, the branch review and its repairs. Not for landing a task (build) or a change with no plan."
argument-hint: "[plan path] [--land]"
---

# Verify

## The loop

1. **Run the gate.** `node "${CLAUDE_SKILL_DIR}/scripts/verify.mjs" --plan <plan path> --root <checkout> --base <base> --reviews-only` first.
   - Then in one message: the full run in the background, step 2's dispatch; end the turn, no ScheduleWakeup, Monitor or sleep.
   - Run by a dispatched agent → the full run in the foreground, `verify.mjs` with timeout 600000.
   - No plan file → end the turn: ask for its path, name `build`'s no-plan route; never hand-run checks or `ship`.
   - `SKIP`, `WARN`, `FIX-ONLY` or `SESSION` line → read `references/gate-lines.md`.
   - `FAIL` or `UNPLANNED` line → end the turn with script's report; rerun no check.
   - Step 3 starts after the full run prints no `FAIL` or `UNPLANNED`.
2. **Review the branch.** Skip `REVIEW Branch` if reviewer reads `none`.
   - Dispatch one `exo:review-branch`: `exo-kind: review-deep` first unless line names no kind, then `DISPATCH Branch` fields.
   - Add 3-5 questions from Goal and each task's `Data:`, `Risk:`, Acceptance.
   - `OVERLAP` not `none` → add `DISPATCH Overlap` dispatch with `OVERLAP` lines, all in one message.
   - Run `node "${CLAUDE_SKILL_DIR}/scripts/merge-reviews.mjs" --root <checkout> --report <each report path>`, each `CODE-RULES` path included; its first line is step 3's verdict, `FINDING` lines `question`, `note`, `report` findings.
   - `CODEX` = `pick-reviewer.mjs --codex` result: `offer` → ask once for a `codex exec` second review of plan and diff, adding its findings to findings path before step 3; else say nothing.
   - `--land` → skip that offer.
3. **Repair the findings.** `FINDINGS` with `fix=1` or more, or `concern=1` or more, goes to the `exo:fix-review` agent, with no model override, filled dispatch line, `../build/review-fixer-prompt.md` by path.
   - `concern=1` or more with `fix=0` → still dispatch; the fixer, not the lead, writes each concern's failing test, marking it unproven only if it passes.
   - `fix=0` and `concern=0` → step 4, with `note` findings; no `exo:fix-review` dispatch, rerun or fix commit.
   - Else → `references/repair.md`.
4. **Offer the finish.** End on `ship`, unless a request or plan rules out a push; then say nothing left the machine.
   - `defect` lines → book each per `references/lessons.md`.
   - `--land` → pass `--land` to `ship`.

## References

| File | Read it when |
|---|---|
| `references/review-rules.md` | Each `BLOCKED` return or resume; step 2 passes `review-rules=` unread. |
| `references/repair.md` | Step 3. |
| `references/lessons.md` | Step 4, a `defect`. |
| `references/gate-lines.md` | Step 1. |
| `references/plan-checks.md` | Never: reviewer reads it. |
| `../route-skills/references/closing.md` | Before final message. |

Report: `REPORT` gets `Changed`, chores, `report` and `note` findings. Message: report rule in `../route-skills/references/closing.md`, three lines: `REPORT` path, `question` findings, one decision: `FAIL`, else `question`, else `ship`.
