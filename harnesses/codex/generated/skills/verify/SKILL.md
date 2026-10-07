---
name: verify
description: "Use when a plan's tasks are landed and its branch needs the gate before a pull request: the scripted checks, the branch review and its repairs. Not for landing a task (build) or a change with no plan."
---

# Verifying a branch

## The loop

1. **Run the gate.** Run `node "{{EXO_ROOT}}/harnesses/codex/run.mjs" "{{EXO_ROOT}}/skills/verify/scripts/verify.mjs" --plan <plan path> --root <checkout> --base <base>`.
   - With no plan file, end the turn: ask for its path and name `build`'s no-plan route, never hand-run checks or `ship`.
   - It runs each landed task's Proof command, except the gate command or a test-suite run (`npm test`, `node --test`) under a default gate.
   - It then runs the gate once: the first backticked command of the plan's `Success criterion`, else its `Land gate:`, else `npm run check`, or `npm test` with no `check` script.
   - `Land gate: none` prints `UNRUN success-criterion`, not `PASS`.
   - It prints one `REVIEWER: <agent>` or `REVIEWER: none (inline route)` line, then `DONE` or `OPEN` per task, `MANUAL` per manual check.
   - A `FAIL` or `STRAY` line ends the turn with the script's own report, and nothing here reruns its checks.
   - It also runs a claims-diff check per landed task; list a `WARN` line in the report, and it never ends the turn.
   - A `SESSION <check>` line names an `mcp:<tool> <args>` call the script never runs: call the `mcp__<server>__<tool>` tool with those args yourself, never through Bash.
   - Record it as `PASS <check>` or `FAIL <check> (<why>)` in the gate's output; a `FAIL` ends the turn like its own.
   - With no `mcp__*__<tool>` tool, record `UNRUN <check>`, not `PASS`, and list it in the report.
2. **Review the branch.** `REVIEWER: none` skips steps 2-3; go to step 4.
   - Otherwise dispatch the `exo-review-branch` agent, or `exo-review-branch-deep` when the `REVIEWER:` line prints that name, with no model override.
   - Pass the plan path, branch, checkout and base.
   - Pass the code standard path from `CLAUDE.md` or `AGENTS.md`, else `{{SKILL_DIR}}/../route-skills/references/code-standard.md`.
   - Pass `{{SKILL_DIR}}/references/review-rules.md` as the review rules path.
   - Pass `<checkout>/.exo/` as the implementer report directory and `<checkout>/.exo/branch-review.md` as the findings path.
   - `BLOCKED` ends the turn with its report.
3. **Repair the findings.** A `FINDINGS` verdict with `fix=1` or more goes to the `exo-fix-review` agent, with no model override, with the text of `../build/review-fixer-prompt.md` and the report path.
   - At `fix=0` go to step 4, with no `exo-fix-review` dispatch, rerun or fix commit.
   - After the dispatch, follow `references/repair.md`.
4. **Offer the finish.** End on `ship`, unless a request or plan rules out a push; then say nothing left the machine.

## References

| File | Read it when |
|---|---|
| `references/review-rules.md` | Step 2, the reviewer's rules. |
| `references/repair.md` | Step 3, after the fixer returns. |

Report: `ship`'s overview as this turn's one report, ending with every task as done or open, each `report` finding, each `question` as a plan question naming its task and any breaking input, and the plan's `MANUAL` checks, listed once.
