---
name: build
description: Use when a session opens on a plan file to run, after a clear, or the user says to run or resume a plan, or a decided change this session touches over two files, a dependency, a public signature, a persisted format or security boundary, or is test-first. Not for authoring or repairing a plan, another change of at most two files, a version bump, or an unproven failure.
argument-hint: "[plan path]"
effort: medium
---

# Implementing a plan

## The loop

1. **Find the plan, settle the workspace, then start the run.** Run `node "${CLAUDE_SKILL_DIR}/scripts/start-run.mjs" --find-only` (`--plan <path>` for a named plan); a failure line on zero or several matches becomes the question to run. Settle where the run commits as `references/workspace.md` says. Read that plan's `Repository:` and `Branch:` lines. Rerun `start-run.mjs --plan <path> --checkout <run's checkout> --session "${CLAUDE_SESSION_ID}"` to write the marker, which survives a clear. Invoking build authorizes commits there and a wave's worktrees beside it; a push or pull request waits for the user's answer to `ship`.
2. **Read the frame, not the plan.** Read `## Goal`, `## Plan basis`, `## Success criterion` and `## Checkpoint`, plus `## Non-goals`, `## Context`, `## Decisions` and `## Visual direction` when present. List tasks with `grep -n '^### Task [0-9]' <plan>`; never open or `@`-reference it, because every later turn re-reads it.
3. **Ask the branch what landed.** Run `node "${CLAUDE_SKILL_DIR}/scripts/next-task.mjs" --plan <plan> --root <checkout>`; `Next: none` sends you to step 7. Only a `Plan-task:` commit decides what landed, never memory, so after a compaction it reruns before any edit.
4. **Form the block.** The current task and the unlanded tasks after it in plan order, eight at most, ending before a `Design:` task or an unlanded `Depends on:` outside the block. A current `Design:` task routes as `references/design-tasks.md` says, then step 3 repeats. There, an open choice the user would not notice is ruled and recorded in the commit body; one they would notice stops the run with one question, because a guess ships as a decision.
5. **Dispatch the unit.** Send each block to the `exo:run-unit` agent with `run_in_background: false`, naming the plan path, branch, checkout, `${CLAUDE_SKILL_DIR}` resolved as `<skill>`, and the task numbers. It builds and lands, so this session never builds. Wait on its return, never a poll or Monitor.
6. **Route the return.** `LANDED` needs nothing. `BUDGET:` means unfinished, whatever its `done` list says: a fresh unit takes the rest from step 3. `BLOCKED all nested dispatch unavailable` ends the turn asking to set `CLAUDE_CODE_MAX_SUBAGENT_SPAWN_DEPTH` to 2 or more. `BLOCKED` with a question runs `node "${CLAUDE_SKILL_DIR}/scripts/resume-plan.mjs" wait` before asking it. Loop to step 3 silently; only a block, failed check or question earns a message. An `exo: context` line means keep working once the task in flight lands.
7. **The tail.** Run `node "${CLAUDE_SKILL_DIR}/scripts/finish-run.mjs"` (`--reviewer <name>` when the user names one); it prints the reviewer and `base=<sha>`, or a failure that ends the turn. Dispatch the printed `exo:review-branch` agent or `exo:review-branch-deep` agent with the plan path, branch, checkout, base and code standard path; `BLOCKED` ends the turn with its report, and `FINDINGS` goes to a `general-purpose` delegate on `sonnet` from `review-fixer-prompt.md` with the report path. Then run the plan's `## Final verification`, or `## Success criterion` for a compact plan. A failed, skipped or unclear command goes to a `general-purpose` delegate on `opus` from `bug-fixer-prompt.md`, then reruns once; a second failure ends the turn with both outputs. Commit what `git status --porcelain` lists as `fix(<scope>): address the branch review`, run `finish-run.mjs --done`, then end on `ship`, with `Closes #<n>` when `## Goal` names issue `#<n>`.

## No spec

A decided change with no plan file runs these steps instead of the loop above.

1. **Orient.** A main session runs `node "${CLAUDE_SKILL_DIR}/../../lib/scratch-exclude.mjs"`. Resume from `<scratch>/implement-next.md` if present (`<scratch>` is what `node "${CLAUDE_SKILL_DIR}/../../lib/scratch-path.mjs"` prints), deleting it once edits land. Read only ranges a plan task's `Files:` lines or the request name. Otherwise, or when one direct search failed, dispatch `exo:locate-code` and read only its `Read next` ranges plus direct callers or callees. Treat upstream Decisions as settled.
2. **Gate.** Count these facts: over two source, test or config files change; a dependency is added; a public signature changes; a persisted format or security boundary is crossed; orientation missed a required file. Zero facts: edit directly, run the check, report and stop. A test-first request continues at any count, because the direct route has no red run. Otherwise draw `A → B` when edit B cannot land green before A; two or more edges go to `spec` unless a brief orders them.
3. **Workspace, then baseline.** Before the first edit, settle where the change commits per `references/workspace.md`, awaiting the answer when it asks. For a multi-file change, confirm a clean working tree or name its pre-existing changed paths.
4. **Build.** Edit in dependency order without asking between files in scope. A hand edit repeated across many files becomes one script; every mutating edit stays idempotent so retries land the same state. After a compaction, rebuild what landed from the working-tree diff, not memory. Report a required edit outside oriented paths before touching it. Comments state a constraint, invariant or reason, never the change's story, because they outlive the change. When a hook reports the context budget crossed, write landed and open edits to `<scratch>/implement-next.md` at a green state and report that a clear comes next.
5. **Prove.** A risky change per `references/test-design.md` quotes failing output before the first production edit and passing output after. A test-first bug commits its failing test alone, because a test committed with its fix never shows it failed. Otherwise exercise the feature, else run a test that failed before, else type check and build. Run runners unpiped and without `cd &&`, which hide the failing command. *Done* needs a `Proof: <command> -> <output>` line from a real command this session ran on input it did not write, not a test runner, else `Unverified: <reason>` with no Done — a Stop hook checks it. When a symptom survives two fix attempts or a repair crosses a second owner, report both and hand it to `find-cause`.
6. **Project knowledge.** Follow `references/project-knowledge.md`.
7. **Fresh eyes.** Skip when the caller says a PR review follows, or when `node "${CLAUDE_SKILL_DIR}/../../lib/size-facts.mjs"` ends with `small`. Otherwise dispatch a `general-purpose` delegate on the session's model from `reviewer-prompt.md` with request, repository root and effort (`low` up to five changed files or 200 changed lines, else `medium`). On `BLOCKED`, report it, leaving the review open. On `FINDINGS`, read only batch-review.md and, per `fix` finding, only its `file:start-end` range; fix it under step 5's proof and append `fixed` or `reported: <reason>`. Without a delegate, run `code-review`, else `references/critique.md`, and report that no separate context was available.
8. **Commit.** Commit where step 3 placed it, leaving out its pre-existing paths, then end on `ship`.

## References

| File | Read it when |
|---|---|
| `references/workspace.md` | Step 1 before the first dispatch, or No spec step 3. |
| `references/wave-worktrees.md` | Never here: `exo:run-unit` reads it. |
| `implementer-prompt.md` | Never here: the unit reads it. |
| `drift-repairer-prompt.md` | Never here: the unit reads it. |
| `bug-fixer-prompt.md` | Step 7, on a failed check. |
| `review-fixer-prompt.md` | Step 7, on a `FINDINGS` verdict. |
| `references/design-tasks.md` | Step 4, for a task with a `Design:` line. |
| `reviewer-prompt.md` | No spec step 7. |
| `references/critique.md` | No spec step 7's last fallback. |
| `references/security.md` | No spec, when its first line applies. |
| `references/data-migration.md` | No spec, when its first line applies. |
| `references/test-design.md` | No spec step 5. |
| `references/test-first.md` | No spec, test-first work, before naming the first boundary. |
| `references/project-knowledge.md` | No spec step 6, when its first line applies. |
| `references/performance.md` | No spec, speed-only work, before measuring. |
| `../route-skills/references/question.md` | Before asking the user to pick among numbered options. |

Report: `ship`'s overview as this turn's one report, ending with the brief's `## Manual checks`.
