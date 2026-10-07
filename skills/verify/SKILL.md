---
name: verify
description: "Use when a plan's tasks are landed and its branch needs the gate before a pull request: the scripted checks, the branch review and its repairs. Not for landing a task (build) or a change with no plan."
argument-hint: "[plan path]"
effort: high
---

# Verifying a branch

## The loop

1. **Run the gate.** Run `node "${CLAUDE_SKILL_DIR}/scripts/verify.mjs" --plan <plan path> --root <checkout> --base <base>`.
   - It runs each landed task's Proof command, except the gate command or a test-suite run (`npm test`, `node --test`) under a default gate.
   - It then runs the gate once: the first backticked command of the plan's `Success criterion`, else its `Land gate:`, else `npm run check`, or `npm test` with no `check` script.
   - `Land gate: none` prints `UNRUN success-criterion`, not `PASS`.
   - It runs the stray-path check against `base`.
   - It prints one `REVIEWER: <agent>` or `REVIEWER: none (inline route)` line, then one `DONE` or `OPEN` line per task and one `MANUAL` line per `## Manual checks` bullet.
   - A `FAIL` or `STRAY` line ends the turn with the script's own report, and nothing here reruns its checks.
   - A `SESSION <check>` line, `<check>` being `Task <n>` or `success-criterion`, names an `mcp:<tool> <args>` call the script never runs: call the `mcp__<server>__<tool>` tool with those args yourself, never through Bash.
   - Record that call as `PASS <check>` or `FAIL <check> (<why>)` in the gate's output; a `FAIL` ends the turn like the script's own.
   - With no `mcp__*__<tool>` tool in this session, record `UNRUN <check>`, not `PASS`, and list it in the turn's report.
2. **Review the branch.** `REVIEWER: none` skips steps 2-3, never step 1; go to step 4.
   - Otherwise dispatch the `exo:review-branch` agent, or `exo:review-branch-deep` when the `REVIEWER:` line prints that name, with no model override.
   - Pass the plan path, branch, checkout and base.
   - Pass the code standard path from `CLAUDE.md` or `AGENTS.md`, else `${CLAUDE_SKILL_DIR}/../route-skills/references/code-standard.md`.
   - Pass `<checkout>/.exo/` as the implementer report directory and `<checkout>/.exo/branch-review.md` as the findings path.
   - `BLOCKED` ends the turn with its report.
3. **Repair the findings.** A `FINDINGS` verdict with `fix=1` or more goes to the `exo:fix-review` agent, with no model override, with the text of `../build/review-fixer-prompt.md` and the report path.
   - At `fix=0` go to step 4, with no `exo:fix-review` dispatch, rerun or fix commit.
   - Then rerun step 1's `verify.mjs`.
   - After that rerun, a `FAIL` or `STRAY` line ends the turn with its report and the fixes uncommitted.
   - Only then run `node "${CLAUDE_SKILL_DIR}/../build/scripts/land-task.mjs" --fix "fix(<scope>): address the branch review" --plan <plan path> --root <checkout>` to commit every changed path.
4. **Offer the finish.** End on `ship`, unless a request or plan rules out a push; then say nothing left the machine.

## References

| File | Read it when |
|---|---|

Report: `ship`'s overview as this turn's one report, ending with every task as done or open, each `report` finding, each `question` as a plan question naming its task and any breaking input, and the plan's `MANUAL` checks, listed once.
