---
name: verify
description: Use when a plan's tasks are landed and its branch needs the gate before a pull request, the scripted checks, the branch review and repairing what it finds. Not for landing a task, which build owns, or a decided change with no plan.
argument-hint: "[plan path]"
effort: high
---

# Verifying a branch

## The loop

1. **Run the gate.** Run `node "${CLAUDE_SKILL_DIR}/scripts/verify.mjs" --plan <plan path>`. It runs each landed task's own Proof command, the plan's `## Success criterion` (or `## Final verification`), and the stray-path check, then prints one `REVIEWER: sonnet` or `REVIEWER: opus` line. A `FAIL` or `STRAY` line ends the turn with the script's own report; nothing here reruns its checks.
2. **Review the branch.** Dispatch the `exo:review-branch` agent on the printed `sonnet` or `opus` with the plan path, branch, checkout, base, the code standard path and `.exo/branch-review.md` as the findings path. `BLOCKED` ends the turn with its report.
3. **Repair the findings.** A `FINDINGS` verdict goes to a `general-purpose` delegate on `sonnet` from `../build/review-fixer-prompt.md` with the report path. Commit what `git status --porcelain` lists as `fix(<scope>): address the branch review`.
4. **Offer the finish.** End on `ship`.

## References

| File | Read it when |
|---|---|

Report: `ship`'s overview as this turn's one report.
