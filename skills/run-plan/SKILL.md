---
name: run-plan
description: Use when a session opens on a plan file to run, after a clear, or when the user says to run or resume a plan. Not for authoring or repairing a plan, or a decided change with no plan file, which build-change owns.
argument-hint: "[plan path]"
effort: medium
---

# Implementing a plan

Run a plan task by task through delegated contexts, so the session that commits stays small. The enemy is reading the whole plan or building in the session: both spend the context the review and the pull request need. The overcorrection is delegating a decision: a task with a `Design:` line needs a judgment only the session can make.

Invoking `/exo:run-plan` on a plan authorizes the workspace you pick at step 1, a wave's temporary worktrees beside it, commits there as steps 6 and 7 time them, and the review's fixes; a push or a pull request only after your answer to the finish question, and nothing else.

## When to use

- A `draft-plan` plan to run or resume, named or found for the current branch.
- Not for writing or repairing the plan (`draft-plan`), a change without a plan (`build-change`), or a failure whose cause is unproven (`find-cause`).

## The loop

1. **Resolve the plan, then the workspace.** Use the path the user named; without one, take the plan under `docs/plans/` or `~/.claude/plans/` whose `Repository:` line equals `git rev-parse --show-toplevel`, prefer one whose `Branch:` equals the current branch, and name the pick. Then settle where the run commits as `references/workspace.md` says, before any dispatch; it covers the plan's `Branch:` name and a `Repository:` folder that is not a git repository yet. Then write the plan's absolute path, and on a second line the run's checkout, to `exo/run-plan.active` under the session directory's `git rev-parse --absolute-git-dir`, because the Stop and SessionStart hooks read it to carry the run across a stop, a clear or a compaction.
2. **Read the frame, not the plan.** Read `## Goal`, `## Plan basis`, `## Success criterion` and `## Checkpoint`; for a long plan also `## Non-goals`, `## Context` and `## Visual direction` when present. List the tasks with `grep -n '^### Task [0-9]' <plan>`; never open the whole file and never `@`-reference it. Open the harness's task list from that listing: one line per plan task, in plan order.
3. **Ask the branch what landed.** Run `node "${CLAUDE_SKILL_DIR}/scripts/next-task.mjs" --plan <plan> --root <checkout>` and read its `Landed:` line and its `Next:` or `Wave:` line: a task has landed when a commit on the branch carries its `Commit:` subject and `Plan-task: <n>` trailer, a task is ready when it has not landed and its `Depends on:` all landed, the first ready task is current, and `Next: none` sends you to step 7. The script forms the wave the plan allows: only when `## Plan basis` carries a `Worktree setup:` line, the plan holds four or more tasks and the current task has no `Design:` line, the wave is that task plus every further ready task without `Design:` whose `Files:` paths share none with a task already in it, four at most; step 4 runs once per wave task. Mark landed lines completed and the current task or wave in progress, so the list reads as the branch does.
4. **Take that task from the script's output**, never from the plan file: under its `Task <n>:` line it prints the task's `Budget:`, `Design:` and `Run:` lines, its drift and `Brief: <path>`, a file under the checkout's git directory holding the frame and the task section, which the dispatch names and never pastes, because a pasted copy rides along on every later turn. A `PLAN DRIFT: Task <n>` line, printed when a `Modify:` region is missing, duplicated or already changed, stops that task before any edit and sends it to step 5's repair; then route on the `Design:` line.
5. **Dispatch the build.** A plan of three tasks or fewer, none with a `Design:` line, dispatches no build: this session reads the task's brief, writes each step's code and runs its `Run:` to its `Expected:` after step 4 printed `Drift: none`, because three dispatches cost more than the pasted code. A wave first gets one worktree per task, from the dispatch tool's worktree isolation or else `git worktree add --detach "<root>-task-<n>" HEAD`, as `references/wave-worktrees.md` says; its builds go out in one message, each brief naming its own worktree as the checkout, and a task alone builds in the run's checkout. Each build goes to the `exo:build-task` agent, which pins `sonnet` at `high` effort whatever this session runs at, with a dispatch from its prompt file that names the brief path and carries step 4's `Budget:` line verbatim on its own line, where the delegate-budget hook reads it in place of the shared default, or under worktree isolation carries the brief's content verbatim, because an isolated delegate reads nothing outside its worktree; a task with a `Design:` line routes as `references/design-tasks.md` says. A repair goes to a `general-purpose` delegate on `opus`, because a dispatch that names no model runs on the session's model: `PLAN DRIFT` goes to the drift repairer, then step 4 repeats; a failed `Run:` whose output names no causal line goes to the bug fixer; a second drift or failure on one task ends the turn with both reports. Inside a wave no repair runs: step 6 discards the wave first.
6. **Commit a green task.** A task proves itself with its targeted test only, not the full check: `GREEN` with a `pass` line for each `Run:` step 4 printed for it, or for a compact task a `pass` line for its test, or, built here, every `Run:` met its `Expected:`. A missing or `fail` line is not green and goes back through step 5 with the report path as the evidence to open; a further `pass` line for a command the task did not name stays green. Before landing a task or each wave task, run `git -C <checkout> diff --stat HEAD` and `git -C <checkout> diff --name-only HEAD`, or `git show --stat <sha>` for an isolated delegate; a listed path outside `Files:` is not green: back to step 5. Run `node "${CLAUDE_SKILL_DIR}/scripts/land-task.mjs" --plan <plan> --task <n> --root <checkout>`, which runs the task's `Commit:` block as written, checks the `Plan-task:` trailer on the new commit and prints the landed set, and push nothing, because a push waits for the finish question. A wave commits only when every report in it is green: `git cherry-pick <sha>` brings the commits onto the branch in plan order, as `references/wave-worktrees.md` says. One report that is not green discards the whole wave, so no task of it commits; its first task that was not green then runs alone from step 4 and the rest of the run forms no wave, because a repair beside two landing commits is how a plan and a branch diverge. Set each landed task's line to completed and return to step 3 with no message between the two: only a blocked task, a failed check or a question for the user earns a message of its own.
7. **The tail.** With every task landed, take the base `git merge-base HEAD origin/<default>` and run `node "${CLAUDE_SKILL_DIR}/scripts/pick-reviewer.mjs" --base <base>`, adding `--reviewer <name>` only when the user names the reviewer directly. Dispatch the `exo:review-branch` agent or the `exo:review-branch-deep` agent it prints, giving it the plan path, the branch, the repository root, the base and the code standard path; it fixes nothing and returns one `verdict=` line. `BLOCKED` ends the turn with its report. On `FINDINGS`, dispatch a `general-purpose` delegate on `sonnet` from `review-fixer-prompt.md` naming the report path. Then run the full check once: the plan's `## Final verification` commands for a long plan, or its `## Success criterion` command for a compact plan. A failed command goes to the bug fixer as step 5 sends it, then the check runs once more; a second failure on one command ends the turn with both outputs. Commit what `git status --porcelain` lists as `fix(<scope>): address the branch review`. Remove step 1's `run-plan.active` marker, so the hooks stop pushing a finished run. Then end on `ship`: its overview is this turn's one report, and the pull request carries `Closes #<n>` when the plan's `## Goal` names issue `#<n>`. Which tasks landed stays in the list.

## Red flags

| The excuse | What holds |
|---|---|
| "I'll read the plan once to get the picture." | The frame plus one task is the picture; the rest is paid on every turn. |
| "This task is small, I'll build it here." | Small edits still fill the session; only a plan of three tasks or fewer, or a `Design:` task whose direction is not yet frozen, builds here. |
| "A reviewer per task catches more." | `Success criterion:` proves a compact task, `Run:` and `Expected:` a long one; the one branch review on `opus` reads what crosses tasks, once. |
| "A status line between two tasks is cheap." | It is written once and re-read on every later turn; the list already carries it. |
| "One commit at the end is cleaner." | The task's own commit, with its `Plan-task:` trailer, is how a cleared context finds where to resume. |

## References

| File | Read it when |
|---|---|
| `references/workspace.md` | Step 1 before the first dispatch. |
| `references/wave-worktrees.md` | Step 5 before a wave's first worktree. |
| `implementer-prompt.md` | Step 5, every build dispatch. |
| `bug-fixer-prompt.md` | Step 5, on a failed `Run:` with no causal line. |
| `drift-repairer-prompt.md` | Step 5, on `PLAN DRIFT`. |
| `review-fixer-prompt.md` | Step 7, on a `FINDINGS` verdict. |
| `references/design-tasks.md` | Step 5, for a task with a `Design:` line. |
| `../route-skills/references/question.md` | Before a message that asks the user to pick among numbered options. |

## Judgment

- The plan's settled decisions outrank implementation defaults; a choice it leaves open that the user would not notice is ruled here and recorded in the commit body, never asked.
- Repository state outranks memory: only a `Plan-task:` commit on the branch decides what has landed, and after a compaction notice step 3 runs again before any edit.
- An `exo: context` line means keep working, not stop: follow its advice once the task in flight lands, then go on to the next task.
