---
name: verify
description: Use when a plan's tasks are landed and its branch needs the gate before a pull request, the scripted checks, the branch review and repairing what it finds. Not for landing a task, which build owns, or a decided change with no plan.
argument-hint: "[plan path]"
effort: high
---

# Verifying a branch

## The loop

1. **Run the gate.** Run `node "${CLAUDE_SKILL_DIR}/scripts/verify.mjs" --plan <plan path> --root <checkout> --base <base>`. It runs each landed task's own Proof command, the plan's `Land gate:` (`npm run check` when the plan names none), and the stray-path check against `base`, then prints one `REVIEWER: review-branch` or `REVIEWER: review-branch-deep` line. A `FAIL` or `STRAY` line ends the turn with the script's own report; nothing here reruns its checks.
2. **Review the branch.** Dispatch the `exo:review-branch` agent, or `exo:review-branch-deep` when the `REVIEWER:` line prints that name, with no model override, passing the plan path, branch, checkout, base, the code standard path and `<checkout>/.exo/branch-review.md` as the findings path. `BLOCKED` ends the turn with its report.
3. **Repair the findings.** A `FINDINGS` verdict goes to a `general-purpose` delegate on `sonnet` from `../build/review-fixer-prompt.md` with the report path. Then run `node "${CLAUDE_SKILL_DIR}/../build/scripts/land-task.mjs" --fix "fix(<scope>): address the branch review" --root <checkout>` to commit every changed path.
4. **Offer the finish.** End on `ship`.

## References

| File | Read it when |
|---|---|

Report: `ship`'s overview as this turn's one report.
