---
name: run-plan
description: Use when a session opens on a plan file to run, after a clear, or when the user says to run or resume a plan. Not for authoring or repairing a plan, or a decided change with no plan file, which build-change owns.
argument-hint: "[plan path]"
effort: medium
---

# Implementing a plan

## The loop

1. **Find the plan, settle the workspace, then start the run.** Run `node "${CLAUDE_SKILL_DIR}/scripts/start-run.mjs" --find-only` (`--plan <path>` for a named plan); a failure line on zero or several matches becomes the question to run. Settle where the run commits as `references/workspace.md` says. Read that plan's `Repository:` and `Branch:` lines. Rerun `start-run.mjs --plan <path> --checkout <run's checkout> --session "${CLAUDE_SESSION_ID}"` to write the marker, which survives a clear. Invoking run-plan authorizes commits there and a wave's worktrees beside it; a push or pull request waits for the user's answer to `ship`.
2. **Read the frame, not the plan.** Read `## Goal`, `## Plan basis`, `## Success criterion` and `## Checkpoint`, plus `## Non-goals`, `## Context`, `## Decisions` and `## Visual direction` when present. List tasks with `grep -n '^### Task [0-9]' <plan>`; never open or `@`-reference it, because every later turn re-reads it.
3. **Ask the branch what landed.** Run `node "${CLAUDE_SKILL_DIR}/scripts/next-task.mjs" --plan <plan> --root <checkout>`; `Next: none` sends you to step 7. Only a `Plan-task:` commit decides what landed, never memory, so after a compaction it reruns before any edit.
4. **Form the block.** The current task and the unlanded tasks after it in plan order, eight at most, ending before a `Design:` task or an unlanded `Depends on:` outside the block. A current `Design:` task routes as `references/design-tasks.md` says, then step 3 repeats. There, an open choice the user would not notice is ruled and recorded in the commit body; one they would notice stops the run with one question, because a guess ships as a decision.
5. **Dispatch the unit.** Send each block to the `exo:run-unit` agent with `run_in_background: false`, naming the plan path, branch, checkout, `${CLAUDE_SKILL_DIR}` resolved as `<skill>`, and the task numbers. It builds and lands, so this session never builds. Wait on its return, never a poll or Monitor.
6. **Route the return.** `LANDED` needs nothing. `BUDGET:` means unfinished, whatever its `done` list says: a fresh unit takes the rest from step 3. `BLOCKED all nested dispatch unavailable` ends the turn asking to set `CLAUDE_CODE_MAX_SUBAGENT_SPAWN_DEPTH` to 2 or more. `BLOCKED` with a question runs `node "${CLAUDE_SKILL_DIR}/scripts/resume-plan.mjs" wait` before asking it. Loop to step 3 silently; only a block, failed check or question earns a message. An `exo: context` line means keep working once the task in flight lands.
7. **The tail.** Run `node "${CLAUDE_SKILL_DIR}/scripts/finish-run.mjs"` (`--reviewer <name>` when the user names one); it prints the reviewer and `base=<sha>`, or a failure that ends the turn. Dispatch the printed `exo:review-branch` agent or `exo:review-branch-deep` agent with the plan path, branch, checkout, base and code standard path; `BLOCKED` ends the turn with its report, and `FINDINGS` goes to a `general-purpose` delegate on `sonnet` from `review-fixer-prompt.md` with the report path. Then run the plan's `## Final verification`, or `## Success criterion` for a compact plan. A failed, skipped or unclear command goes to a `general-purpose` delegate on `opus` from `bug-fixer-prompt.md`, then reruns once; a second failure ends the turn with both outputs. Commit what `git status --porcelain` lists as `fix(<scope>): address the branch review`, run `finish-run.mjs --done`, then end on `ship`, with `Closes #<n>` when `## Goal` names issue `#<n>`.

## References

| File | Read it when |
|---|---|
| `references/workspace.md` | Step 1 before the first dispatch. |
| `references/wave-worktrees.md` | Never here: `exo:run-unit` reads it. |
| `implementer-prompt.md` | Never here: the unit reads it. |
| `drift-repairer-prompt.md` | Never here: the unit reads it. |
| `bug-fixer-prompt.md` | Step 7, on a failed check. |
| `review-fixer-prompt.md` | Step 7, on a `FINDINGS` verdict. |
| `references/design-tasks.md` | Step 4, for a task with a `Design:` line. |
| `../route-skills/references/question.md` | Before asking the user to pick among numbered options. |

Report: `ship`'s overview as this turn's one report, ending with the brief's `## Manual checks`.
