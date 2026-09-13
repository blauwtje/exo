---
name: implementing
description: Use when a session opens on a plan file to run, after a clear, or when the user says to run or resume a plan. Not for authoring or repairing a plan, a decided change with no plan file, or a task that must build in this session, which `implementing-batch` owns.
argument-hint: "[plan path]"
effort: high
---

# Implementing a plan

Run a plan task by task through delegated contexts, so the session that commits stays small. The enemy is reading the whole plan or building in the session: both spend the context the review and the pull request need. The overcorrection is delegating a decision: a task with a `Design:` line needs a judgment only the session can make.

Invoking `/exo:implementing` on a plan authorizes the branch its `## Plan basis` names under `Branch:`, commits and pushes on that branch as steps 6 and 7 time them, the review's fixes, and on a release run the repository's own release steps; a pull request only after your yes, a merge only after a second yes, and nothing else.

## When to use

- A session opens on a plan written by `planning`, or the user says to run or resume one.
- Not for writing or repairing the plan (`planning`), a change without a plan (`implementing-batch`), or a failure whose cause is unproven (`debug`).

## The loop

1. **Resolve the plan, then the branch.** Use the path the user named; without one, take the plan under `docs/plans/` or `~/.claude/plans/` whose `Repository:` line equals `git rev-parse --show-toplevel`, prefer one whose `Branch:` equals the current branch, and name the pick. On the default branch while `Branch:` names another, `git switch -c <Branch:>` and `git push -u origin <Branch:>`. On the default branch while `Branch:` names it too, read the root `CLAUDE.md` or `AGENTS.md`: when it commits and releases on the default branch, stay there and treat the run as a release run, because that rule outranks a branch this skill would invent; otherwise branch as `<type>/<slug>` from the plan's goal. Any other branch stops with a report.
2. **Read the frame, not the plan.** Read `## Goal`, `## Plan basis`, `## Non-goals`, `## Context` and `## Visual direction`, then list the tasks with `grep -n '^### Task [0-9]' <plan>`; never open the whole file and never `@`-reference it. Open the run's list from that listing under the progress rule in `using-exo`: one line per plan task, in plan order.
3. **Ask the branch what landed.** A task has landed when `git log --grep '^Plan-task: <n>$' --format=%h` on the branch prints a commit. The first unlanded task whose `Depends on:` all landed is current; all landed sends you to step 7. Set every landed line to completed and the current one to in progress, so the list reads as the branch does.
4. **Extract that task alone**, fence-aware, and route on its `Design:` line:
   `awk -v n=<n> '/^```/{fence=!fence} !fence && /^### Task [0-9]/{on=($3==n":")} on' <plan>`
5. **Dispatch the build.** A task without `Design:` goes to a `general-purpose` delegate on `sonnet` with a brief written from `implementer-prompt.md`; the model is named on every dispatch, because an omitted model inherits the session's. A task with `Design:` builds here under `designing` from its Build phase, or ends the turn when `## Visual direction` records no direction. A `PLAN DRIFT` report goes to a `general-purpose` delegate on `opus` from `plan-author-prompt.md` with the plan path, the task number and the mismatch, then step 4 repeats; a failed `Run:` whose output names no causal line goes to a `general-purpose` delegate on `opus` from `bug-fixer-prompt.md` with the command, the log path and the paths; a second drift or a second failure on one task ends the turn with both reports.
6. **Commit a green task.** A build report is green when its Proof shows every `Run:` printing its `Expected:`; one that is not green goes back through step 5, never to a commit. Run the task's `Commit:` block as written, then `git push`, except on a release run, which pushes nothing before the repository's release step, because that step decides what a pushed tree must already carry, such as a raised version. Set that task's line to completed and return to step 3 with no message between the two, because the list carries the run: only a blocked task, a failed check or a question for the user earns a message of its own.
7. **The tail.** With every task landed, dispatch one `general-purpose` delegate on `opus` with a brief from `branch-reviewer-prompt.md`, its base `git merge-base HEAD origin/<default>`: one reading of the whole branch sees what crosses tasks and costs one review instead of one per task. A `BLOCKED` verdict ends the turn with its report; otherwise, when `git status --porcelain` lists its fixes, commit them as `fix(<scope>): address the branch review`, and `git push` outside a release run. A release run then follows the repository's release steps in order, pushing where they push, and asks no pull-request question. Any other run asks one question, each option on one line and the recommended one first: open the pull request and, once checks are green, ask the merge question; open it and stop; or the user opens it. On a PR: `gh pr create --base <default> --title --body-file` with the goal, the proof line and `Closes #<n>` on an `issue-<n>-<slug>` branch; on a merge yes read `../merge-prs/SKILL.md` and run its Steps 2, 4 and 5. On an `issue-<n>-<slug>` branch name `/exo:ship-issue <n>` next. This turn's one report closes the run under the closing rule in `using-exo`; which tasks landed stays in the list.

## Red flags

| Thought | Reality |
|---|---|
| "I'll read the plan once to get the picture." | The frame plus one task is the picture; the rest is paid on every turn. |
| "This task is small, I'll build it here." | Small edits still fill the session; only a `Design:` task belongs here. |
| "A reviewer per task catches more." | `Run:` and `Expected:` prove each task; the one branch review on `opus` reads what crosses tasks, once. |
| "A status line between two tasks is cheap." | It is written once and re-read on every later turn; the list already carries it. |
| "One commit at the end is cleaner." | The task's own commit, with its `Plan-task:` trailer, is how a cleared context finds where to resume. |

## References

| File | Read it when |
|---|---|
| `implementer-prompt.md` | Step 5, before every build dispatch. |
| `bug-fixer-prompt.md` | Step 5, before a dispatch on a failed `Run:` with no causal line. |
| `plan-author-prompt.md` | Step 5, before a dispatch on `PLAN DRIFT`. |
| `branch-reviewer-prompt.md` | Step 7, before the branch review dispatch. |
| `../merge-prs/SKILL.md` | Step 7, after a merge yes, for its Steps 2, 4 and 5. |

## Judgment

- Explicit user instructions outrank this skill; a named plan path outranks the search.
- The plan's settled decisions outrank implementation defaults: `planning` owns the plan's text, the build delegate owns the build, the branch reviewer owns its findings, this skill owns routing and commits. A choice the plan leaves open and the user would not notice is ruled here and recorded in the commit body, never sent back as a question.
- Repository state outranks memory: only a `Plan-task:` commit on the branch decides what has landed, and after a compaction notice step 3 runs again before any edit.
