---
name: gate
description: "Use when a plan's tasks are landed and its branch needs the gate before a pull request: the scripted checks, the branch review and its repairs. Not for landing a task (build) or a change with no plan."
argument-hint: "[plan path] [--land]"
---

# Gate

The gate readies a branch for a pull request.

## The loop

1. **Run the gate.** Run `node "${CLAUDE_SKILL_DIR}/scripts/gate.mjs" --plan <plan path> --root <checkout> --base <base> --reviews-only` first.
   - Then in one message: the full run in the background, step 2's dispatch; end the turn, no ScheduleWakeup, Monitor or sleep.
   - Dispatched agent → full run in the foreground, timeout 600000.
   - No plan file → end the turn: ask for its path and name `build`'s no-plan route; never hand-run checks or `ship`.
   - `SKIP`, `WARN`, `FIX-ONLY`, `SESSION` or `SELF-HOSTED` line → read `references/gate-lines.md`.
   - On `FAIL` or `UNPLANNED`, end the turn with its report; rerun no check. Step 3 starts after the full run prints no `FAIL` or `UNPLANNED`.
2. **Review the branch.** Reviewer `none`: skip only the dispatch, still merge.
   - Dispatch `exo:review-branch` per `DISPATCH Branch`, one message. Start with `exo-kind: review-deep` unless the line names no kind, add its fields, end each with `Read:` and changed files read.
   - Add 3-5 questions from Goal and each task's `Data:`, `Risk:` and Acceptance. When `OVERLAP` is not `none`, add `DISPATCH Overlap`.
   - Run `node "${CLAUDE_SKILL_DIR}/scripts/merge-reviews.mjs" --root <checkout> --base <base> --report <each report path>`, each `CODE-RULES` path included. Its first line is step 3's verdict, `FINDING` lines are the `question`, `note` and `report` findings only, `UNREAD-FILE` lines unread files.
   - On a `CODEX offer` line, ask once for a `codex exec` review of plan and diff, adding them to findings path; else say nothing.
   - `--land` → skip.
3. **Repair the findings.** `FINDINGS` with `fix=1` or more, or `concern=1` or more, goes to the `exo:fix-review` agent, with no model override, filled dispatch line and `../build/review-fixer-prompt.md` by path.
   - With `concern=1` or more and `fix=0`, still dispatch: the fixer, not this session, writes each concern's failing test, marking it unproven only if it passes.
   - With `fix=0` and `concern=0`, go to step 4 with `note` findings and no `exo:fix-review` dispatch, rerun or fix commit.
   - Otherwise read `references/repair.md`.
4. **Offer the finish.** End on `ship`, unless a request or plan rules out a push; then say nothing left the machine.
   - Book each `defect` per `references/lessons.md`.
   - `--land` → pass `--land` to `ship`.

## References

| File | Read it when |
|---|---|
| `references/review-rules.md` | Each `BLOCKED` return or resume; step 2 passes `review-rules=` unread. |
| `references/repair.md` | Step 3. |
| `references/lessons.md` | Step 4. |
| `references/gate-lines.md` | Step 1. |
| `references/plan-checks.md` | Never: reviewer reads it. |
| `../route-skills/references/closing.md` | Before final message. |

Report: `REPORT` gets `Changed`, chores, `report`, `note` findings. Message: the report rule, three lines: `REPORT` path, `question` findings, one decision: `FAIL`, else `question`, else `ship`.
