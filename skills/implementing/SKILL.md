---
name: implementing
description: Use when a session opens on a plan file to run, after a clear, or when the user says to run or resume a plan. Not for authoring or repairing a plan, a decided change with no plan file, or a task that must build in this session, which `implementing-batch` owns.
argument-hint: "[plan path]"
effort: high
---

# Implementing a plan

Run a plan task by task through delegated contexts, so the session that commits stays small. The enemy is reading the whole plan or building in the session: both spend the context the review and the pull request need. The overcorrection is delegating a decision: a task with a `Design:` line needs a judgment only the session can make.

Invoking `/exo:implementing` on a plan authorizes the workspace you pick at step 1, a wave's temporary worktrees beside it, commits there as steps 6 and 7 time them, and the review's fixes; a push or a pull request only after your answer to the finish question, and nothing else.

## When to use

- A session opens on a plan written by `planning`, or the user says to run or resume one.
- Not for writing or repairing the plan (`planning`), a change without a plan (`implementing-batch`), or a failure whose cause is unproven (`debug`).

## The loop

1. **Resolve the plan, then the workspace.** Use the path the user named; without one, take the plan under `docs/plans/` or `~/.claude/plans/` whose `Repository:` line equals `git rev-parse --show-toplevel`, prefer one whose `Branch:` equals the current branch, and name the pick. Then settle where the run commits as `references/workspace.md` says, before any dispatch: a new branch takes the plan's `Branch:` when it names a branch other than the default, otherwise `<type>/<slug>` from the plan's goal. A plan whose `Repository:` folder is not a git repository yet and holds nothing but `docs` is the exception: the run itself runs `git init -b main` there, asks no workspace question and commits on `main`, because a repository with no commit has nothing to branch from. The run commits only where that answer puts it.
2. **Read the frame, not the plan.** Read `## Goal`, `## Plan basis`, `## Non-goals`, `## Context` and `## Visual direction`, then list the tasks with `grep -n '^### Task [0-9]' <plan>`; never open the whole file and never `@`-reference it. Open the run's list from that listing under the progress rule in `using-exo`: one line per plan task, in plan order.
3. **Ask the branch what landed.** A task has landed when `git log --grep '^Plan-task: <n>$' --format=%h` on the branch prints a commit. A task is ready when it has not landed and its `Depends on:` all landed; the first ready task is current, and all landed sends you to step 7. When `## Plan basis` carries a `Worktree setup:` line and the current task has no `Design:` line, the wave is that task plus the next ready tasks without `Design:`, three at most, because a fourth report crowds the session and independence is the plan's word, never a guess from paths; step 4 then runs once per task of the wave. Set every landed line to completed and the current task, or every task of the wave, to in progress, so the list reads as the branch does.
4. **Extract that task alone**, fence-aware, and route on its `Design:` line:
   `awk -v n=<n> '/^```/{fence=!fence} !fence && /^### Task [0-9]/{on=($3==n":")} on' <plan>`
5. **Dispatch the build.** A wave of two or more tasks first gets one worktree per task, `git worktree add --detach "<root>-task-<n>" HEAD` and then the plan's `Worktree setup:` command inside it, as `references/workspace.md` says under `## Wave worktrees`; its builds go out in one message so they run together, each brief naming its own worktree as the checkout, and a task alone builds in the run's checkout. A task without `Design:` goes to a `general-purpose` delegate on `sonnet` with a brief written from `implementer-prompt.md`; the model is named on every dispatch, because a dispatch that names no model runs on the session's model. A task with `Design:` whose `## Visual direction` names the chosen direction goes to a `general-purpose` delegate on `opus` with a brief from `implementer-prompt.md`, which enters `designing` at its Build phase and takes that direction as given; one whose `## Visual direction` reads `Direction: pending at rung <n>` builds here under `designing` from its Direction phase, and one that records no direction builds here under `designing` from its `## Route`. A `PLAN DRIFT` report goes to a `general-purpose` delegate on `opus` from `drift-repairer-prompt.md` with the plan path, the task number and the mismatch, then step 4 repeats; a failed `Run:` whose output names no causal line goes to a `general-purpose` delegate on `opus` from `bug-fixer-prompt.md` with the command, the log path and the paths; a second drift or a second failure on one task ends the turn with both reports. Inside a wave none of these repair routes runs: step 6 discards the wave first.
6. **Commit a green task.** A task is green when the delegate returns `GREEN` with one `pass` line per `Run:` the task section holds; a missing, extra or `fail` line is not green and goes back through step 5, never to a commit, with the report path as the evidence to open. Run the task's `Commit:` block as written and push nothing, because a push leaves the machine and waits for the finish question. A wave commits only when every report in it is green: each `Commit:` block runs inside its task's worktree, `git cherry-pick <sha>` brings the commits onto the branch in plan order, and the worktrees are removed. One report that is not green discards the whole wave as `## Wave worktrees` says, so no task of it commits; its first task that was not green then runs alone from step 4 and the rest of the run forms no wave, because a repair beside two landing commits is how a plan and a branch diverge. Set each landed task's line to completed and return to step 3 with no message between the two, because the list carries the run: only a blocked task, a failed check or a question for the user earns a message of its own.
7. **The tail.** With every task landed, dispatch the `exo:branch-reviewer` agent once, giving it the plan path, the branch, the repository root, the base `git merge-base HEAD origin/<default>`, the code standard path and the plan's `## Final verification`: one reading of the whole branch sees what crosses tasks and costs one review instead of one per task. A `BLOCKED` verdict ends the turn with its report; otherwise, when `git status --porcelain` lists its fixes, commit them as `fix(<scope>): address the branch review`. Then end on `references/finishing.md`: its overview is this turn's one report, its question is the only route to a push or a pull request, and the pull request carries `Closes #<n>` when the plan's `## Goal` names issue `#<n>`. Which tasks landed stays in the list.

## Red flags

| Thought | Reality |
|---|---|
| "I'll read the plan once to get the picture." | The frame plus one task is the picture; the rest is paid on every turn. |
| "This task is small, I'll build it here." | Small edits still fill the session; only a `Design:` task whose direction is not yet frozen belongs here. |
| "A reviewer per task catches more." | `Run:` and `Expected:` prove each task; the one branch review on `opus` reads what crosses tasks, once. |
| "A status line between two tasks is cheap." | It is written once and re-read on every later turn; the list already carries it. |
| "One commit at the end is cleaner." | The task's own commit, with its `Plan-task:` trailer, is how a cleared context finds where to resume. |

## References

| File | Read it when |
|---|---|
| `references/workspace.md` | Step 1, before the first dispatch, and step 5, before a wave's first worktree. |
| `references/finishing.md` | Step 7, once the review's fixes are committed. |
| `implementer-prompt.md` | Step 5, before every build dispatch. |
| `bug-fixer-prompt.md` | Step 5, before a dispatch on a failed `Run:` with no causal line. |
| `drift-repairer-prompt.md` | Step 5, before a dispatch on `PLAN DRIFT`. |

## Judgment

- Explicit user instructions outrank this skill; a named plan path outranks the search.
- The plan's settled decisions outrank implementation defaults: `planning` owns the plan's text, the build delegate owns the build, the branch reviewer owns its findings, this skill owns routing and commits. A choice the plan leaves open and the user would not notice is ruled here and recorded in the commit body, never sent back as a question.
- Repository state outranks memory: only a `Plan-task:` commit on the branch decides what has landed, and after a compaction notice step 3 runs again before any edit.
