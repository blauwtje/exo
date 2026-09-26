---
name: run-plan
description: Use when a session opens on a plan file to run, after a clear, or when the user says to run or resume a plan. Not for authoring or repairing a plan, or a decided change with no plan file, which build-change owns.
argument-hint: "[plan path]"
effort: medium
---

# Implementing a plan

Run a plan task by task through delegated contexts, so the session that commits stays small. The enemy is reading the whole plan or building in the session: both spend the context the review and the pull request need. The overcorrection is delegating a decision: a task with a `Design:` line needs a judgment only the session can make.

Invoking `/exo:run-plan` on a plan authorizes the workspace you pick at step 1, a wave's temporary worktrees beside it, commits there as the units of step 5 and step 7 time them, and the review's fixes; a push or a pull request only after your answer to the finish question, and nothing else.

## When to use

- A `define-scope` brief with a `## Tasks` list, or an older plan, to run or resume, named or found for the current branch.
- Not for writing or repairing the task list (`define-scope`), a change without a plan (`build-change`), or a failure whose cause is unproven (`find-cause`).

## The loop

1. **Resolve the plan, then the workspace.** Use the path the user named; without one, take the plan under `docs/plans/`, `docs/specs/` or `~/.claude/plans/` whose `Repository:` line equals `git rev-parse --show-toplevel`, prefer one whose `Branch:` equals the current branch, and name the pick. Then settle where the run commits as `references/workspace.md` says, before any dispatch; it covers the plan's `Branch:` and a `Repository:` folder not yet under git. Then write four lines to `exo/run-plan.active` under the session directory's `git rev-parse --absolute-git-dir`: the plan's absolute path, the run's checkout, `${CLAUDE_SESSION_ID}` and `date -u +%Y-%m-%dT%H:%M:%SZ`. The Stop and SessionStart hooks read it to carry the run across a stop, clear or compaction. Then run `node "${CLAUDE_SKILL_DIR}/../../lib/scratch-exclude.mjs"` so git ignores each agent's `.exo/`.
2. **Read the frame, not the plan.** Read `## Goal`, `## Plan basis`, `## Success criterion` and `## Checkpoint`; for a long plan or a brief also `## Non-goals`, `## Context`, `## Decisions` and `## Visual direction` when present. List the tasks with `grep -n '^### Task [0-9]' <plan>`; never open the whole file or `@`-reference it.
3. **Ask the branch what landed.** Run `node "${CLAUDE_SKILL_DIR}/scripts/next-task.mjs" --plan <plan> --root <checkout>` and read its `Landed:` line and its `Next:` or `Wave:` line: a task has landed when a commit on the branch carries its `Commit:` subject and `Plan-task: <n>` trailer, a task is ready when it has not landed and its `Depends on:` all landed, the first ready task is current, and `Next: none` sends you to step 7. The script forms a wave only when `## Plan basis` carries a `Worktree setup:` line, the plan holds four or more tasks and the current task has no `Design:` line: the wave adds to it each further ready task without `Design:` whose `Files:` paths share none with a task already in it, four at most.
4. **Form the block.** The block is the current task and the unlanded tasks after it in plan order, eight at most, ending before the first task with a `Design:` line, because each block runs in one fresh context that a ninth task would crowd. A current task with a `Design:` line routes as `references/design-tasks.md` says, then step 3 repeats.
5. **Dispatch the unit.** Each block goes to the `exo:run-unit` agent, naming the plan path, the branch, the checkout, `${CLAUDE_SKILL_DIR}` resolved as `<skill>`, and the block's task numbers; it dispatches every build, repair and wave for its tasks and lands them, so this session never builds, lands or repairs a block task itself, because that work is what would fill this session. Its return holds one `LANDED`, `OPEN` or `BLOCKED` line per task, or one `BUDGET:` line.
6. **Route the return.** `LANDED` needs nothing. `OPEN` or a `BUDGET:` line goes back to step 3 and a fresh `exo:run-unit` agent for the open tasks, never a finish here. `BLOCKED all nested dispatch unavailable` ends the turn telling the user to set `CLAUDE_CODE_MAX_SUBAGENT_SPAWN_DEPTH` to 2 or more, with no fallback, because building here is the bloat the unit exists to avoid. `BLOCKED` with a question asks the user it, then a fresh unit takes the rest from step 3; a second `OPEN` for one task with no new cause ends the turn with the unit's report paths. Return to step 3 with no message between: only a blocked task, a failed check or a question for the user earns a message.
7. **The tail.** With every task landed, take the base `git merge-base HEAD origin/<default>` and run `node "${CLAUDE_SKILL_DIR}/scripts/pick-reviewer.mjs" --base <base>`, adding `--reviewer <name>` only when the user names the reviewer directly. Dispatch the `exo:review-branch` agent or the `exo:review-branch-deep` agent it prints, giving it the plan path, the branch, the repository root, the base and the code standard path; it fixes nothing and returns one `verdict=` line. `BLOCKED` ends the turn with its report. On `FINDINGS`, dispatch a `general-purpose` delegate on `sonnet` from `review-fixer-prompt.md` naming the report path. Then run the full check once: the plan's `## Final verification` commands for a long plan, or its `## Success criterion` command for a compact plan. A failed, skipped or unclear command goes to a `general-purpose` delegate on `opus` from `bug-fixer-prompt.md`, then the check runs once more; a second failure on one command ends the turn with both outputs. Commit what `git status --porcelain` lists as `fix(<scope>): address the branch review`. Remove step 1's `run-plan.active` marker, so the hooks stop pushing a finished run. Then end on `ship`: its overview is this turn's one report, and the pull request carries `Closes #<n>` when the plan's `## Goal` names issue `#<n>`.

## Red flags

| The excuse | What holds |
|---|---|
| "I'll read the plan once to get the picture." | The frame plus one task is the picture; the rest is paid on every turn. |
| "This task is small, I'll build it here." | Small edits still fill the session; only a `Design:` task builds here, and every other task goes to a unit. |
| "A reviewer per task catches more." | `Proof:` proves a compact task, `Run:` and `Expected:` a long one; the one branch review on `opus` reads what crosses tasks, once. |
| "A status line between two tasks is cheap." | It is written once and re-read on every later turn; the `Plan-task:` trailers already carry it. |
| "One commit at the end is cleaner." | The task's own commit, with its `Plan-task:` trailer, is how a cleared context finds where to resume. |

## References

| File | Read it when |
|---|---|
| `references/workspace.md` | Step 1 before the first dispatch. |
| `references/wave-worktrees.md` | Never here: the `exo:run-unit` agent reads it before a wave's first worktree. |
| `implementer-prompt.md` | Never here: the unit reads it for every build dispatch. |
| `drift-repairer-prompt.md` | Never here: the unit reads it on `PLAN DRIFT`. |
| `bug-fixer-prompt.md` | Step 7, on a failed check; the unit reads it on a failed `Run:` with no causal line. |
| `review-fixer-prompt.md` | Step 7, on a `FINDINGS` verdict. |
| `references/design-tasks.md` | Step 4, for a task with a `Design:` line. |
| `../route-skills/references/question.md` | Before a message that asks the user to pick among numbered options. |

## Judgment

- The plan's settled decisions outrank implementation defaults; a choice it leaves open that the user would not notice is ruled here and recorded in the commit body, never asked.
- A product choice the user would notice that the plan leaves open stops the run with one question to the user, because a builder's guess ships as a decision.
- Repository state outranks memory: only a `Plan-task:` commit on the branch decides what has landed, and after a compaction notice step 3 runs again before any edit.
- An `exo: context` line means keep working, not stop: follow its advice once the task in flight lands, then go on.
