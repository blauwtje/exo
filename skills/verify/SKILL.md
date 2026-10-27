---
name: verify
description: "Use when a plan's tasks are landed and its branch needs the gate before a pull request: the scripted checks, the branch review and its repairs. Not for landing a task (build) or a change with no plan."
argument-hint: "[plan path] [--land]"
---

# Verify

## The loop

1. **Run the gate.** `node "${CLAUDE_SKILL_DIR}/scripts/verify.mjs" --plan <plan path> --root <checkout> --base <base> --reviews-only` first.
   - Then in one message: the full run in the background, step 2's dispatch; end the turn, no ScheduleWakeup, Monitor or sleep.
   - Dispatched agent → full run in the foreground, timeout 600000.
   - No plan file → end the turn: ask for its path, name `build`'s no-plan route; never hand-run checks or `ship`.
   - `SKIP`, `WARN`, `FIX-ONLY` or `SESSION` line → read `references/gate-lines.md`.
   - `SELF-HOSTED` line → list it in report.
   - `FAIL` or `UNPLANNED` line → end the turn with its report; rerun no check.
   - Step 3 starts after the full run prints no `FAIL` or `UNPLANNED`.
2. **Review the branch.** Skip `REVIEW Branch` if reviewer is `none`.
   - Dispatch `exo:review-branch` per `DISPATCH Branch`, all in one message: `exo-kind: review-deep` first unless line names no kind, then its fields; each ends `Read:` with changed files read.
   - Add 3-5 questions from Goal and each task's `Data:`, `Risk:`, Acceptance.
   - `OVERLAP` not `none` → add `DISPATCH Overlap` with those lines.
   - Run `node "${CLAUDE_SKILL_DIR}/scripts/merge-reviews.mjs" --root <checkout> --base <base> --report <each report path>`, each `CODE-RULES` path included; its first line is step 3's verdict, `FINDING` lines `question`, `note`, `report` findings, `UNREAD-FILE` lines unread files.
   - `CODEX offer` line → ask once for a `codex exec` review of plan and diff, adding them to findings path; else say nothing.
   - `--land` → skip.
3. **Repair the findings.** `FINDINGS` with `fix=1` or more, or `concern=1` or more, goes to the `exo:fix-review` agent, with no model override, filled dispatch line, `../build/review-fixer-prompt.md` by path.
   - `concern=1` or more with `fix=0` → still dispatch; the fixer, not the lead, writes each concern's failing test, marking it unproven only if it passes.
   - `fix=0` and `concern=0` → step 4 with `note` findings; no `exo:fix-review` dispatch, rerun or fix commit.
   - Else → `references/repair.md`.
4. **Offer the finish.** End on `ship`, unless a request or plan rules out a push; then say nothing left the machine.
   - `defect` → book each per `references/lessons.md`.
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

Report: `REPORT` gets `Changed`, chores, `report`, `note` findings. Message: `../route-skills/references/closing.md` report rule, three lines: `REPORT` path, `question` findings, one decision: `FAIL`, else `question`, else `ship`.
