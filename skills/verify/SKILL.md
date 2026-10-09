---
name: verify
description: "Use when a plan's tasks are landed and its branch needs the gate before a pull request: the scripted checks, the branch review and its repairs. Not for landing a task (build) or a change with no plan."
argument-hint: "[plan path]"
effort: high
---

# Verifying a branch

## The loop

1. **Run the gate.** Run `node "${CLAUDE_SKILL_DIR}/scripts/verify.mjs" --plan <plan path> --root <checkout> --base <base>`.
   - No plan file → end the turn: ask for its path, name `build`'s no-plan route; never hand-run checks or `ship`.
   - Script runs each landed task's Proof command, except the gate command or a test-suite run (`npm test`, `node --test`) under a default gate; one already passed on this tree prints `SKIP`.
   - Then the gate once: first backticked command of the plan's `Success criterion`, else its `Land gate:`, else `npm run check`, else `npm test` with no `check` script.
   - `FAIL` or `STRAY` line → end the turn with the script's own report; rerun no check.
   - `WARN` or `FIX-ONLY` line → list in the report; never ends the turn.
   - `SESSION <check>` line names an `mcp:<tool> <args>` call the script skips → call `mcp__<server>__<tool>` with those args yourself, not through Bash.
   - Record it as `PASS <check>` or `FAIL <check> (<why>)` in the gate's output; that `FAIL` ends the turn.
   - No `mcp__*__<tool>` tool → record `UNRUN <check>`, not `PASS`; list it in the report.
2. **Review each task.** Skip a `REVIEWED` line and a `REVIEW` line whose reviewer reads `none`.
   - Dispatch one `exo:review-branch` agent per other `REVIEW` line, all in one message, setting its `model` and `effort` to the line's `model=` and `effort=` when it names them, unless the budget rule sets others.
   - Add one dispatch with scope `overlap` when `OVERLAP` lists more than `none`.
   - Each dispatch follows `references/review-rules.md` `## Dispatch`.
   - `BLOCKED` → end the turn with its report.
   - Then run `node "${CLAUDE_SKILL_DIR}/scripts/merge-reviews.mjs" --root <checkout> --report <each report path>`, `REVIEWED` records included; its line is step 3's review verdict.
   - Run `node "${CLAUDE_SKILL_DIR}/scripts/pick-reviewer.mjs" --codex`: `offer` → ask the user once for a `codex exec` second review of the same plan and diff; append its findings to the findings path before step 3; `none` or a decline → say nothing.
3. **Repair the findings.** A `FINDINGS` verdict with `fix=1` or more goes to the `exo:fix-review` agent, with no model override, with the text of `../build/review-fixer-prompt.md` and the report path.
   - `fix=0` → step 4, with no `exo:fix-review` dispatch, rerun or fix commit.
   - After the dispatch → follow `references/repair.md`.
4. **Offer the finish.** End on `ship`, unless a request or plan rules out a push; then say nothing left the machine.

## References

| File | Read it when |
|---|---|
| `references/review-rules.md` | Step 2, each dispatch. |
| `references/repair.md` | Step 3, after the fixer returns. |

Report: after appending `Changed` and follow-up chores to the `REPORT` file, three state lines (outcome; tasks and checks counted; branch and run report path), then the one blocking decision with one recommended option.
