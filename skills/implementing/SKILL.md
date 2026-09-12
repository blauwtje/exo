---
name: implementing
description: Use when a session opens on a plan file to run, after a clear, or when the user says to run or resume a plan. Not for authoring or repairing a plan, a decided change with no plan file, or a task that must build in this session, which `implementing-batch` owns.
effort: high
---

# Implementing a plan

Run a plan task by task through delegated contexts, so the session that commits stays small. The enemy is reading the whole plan or building in the session: both spend the context the review and the pull request need. The overcorrection is delegating a decision: a task with a `Design:` line needs a judgment only the session can make.

Invoking `/exo:implementing` on a plan authorizes the branch its `## Plan basis` names under `Branch:`, commits and pushes on that branch, and the review's fixes; a pull request only after your yes, a merge only after a second yes, and nothing else.

## When to use

- A session opens on a plan written by `planning`, or the user says to run or resume one.
- Not for writing or repairing the plan (`planning`), a change without a plan (`implementing-batch`), or a failure whose cause is unproven (`debug`).

## The loop

1. **Resolve the plan, then the branch.** Use the path the user named; without one, take the plan under `docs/plans/` or `~/.claude/plans/` whose `Repository:` line equals `git rev-parse --show-toplevel`, prefer one whose `Branch:` equals the current branch, and name the pick. On the default branch while `Branch:` names another, `git switch -c <Branch:>` and `git push -u origin <Branch:>`; on the default branch while `Branch:` names it too, branch as `<type>/<slug>` from the plan's goal; any other branch stops with a report.
2. **Read the frame, not the plan.** Read `## Goal`, `## Plan basis`, `## Non-goals`, `## Context` and `## Visual direction`, then list the tasks with `grep -n '^### Task [0-9]' <plan>`; never open the whole file and never `@`-reference it.
3. **Ask the branch what landed.** A task has landed when `git log --grep '^Plan-task: <n>$' --format=%h` on the branch prints a commit. The first unlanded task whose `Depends on:` all landed is current; all landed sends you to step 7.
4. **Extract that task alone**, fence-aware, and route on its `Design:` line:
   `awk -v n=<n> '/^```/{fence=!fence} !fence && /^### Task [0-9]/{on=($3==n":")} on' <plan>`
5. **Dispatch the build.** A task without `Design:` goes to a `general-purpose` delegate on `sonnet` with a brief written from `implementer-prompt.md`; the model is named on every dispatch, because an omitted model inherits the session's. A task with `Design:` builds here under `designing` from its Build phase, or ends the turn when `## Visual direction` records no direction. A `PLAN DRIFT` report goes to a `general-purpose` delegate on `opus` from `plan-author-prompt.md` with the plan path, the task number and the mismatch, then step 4 repeats; a failed `Run:` whose output names no causal line goes to a `general-purpose` delegate on `opus` from `bug-fixer-prompt.md` with the command, the log path and the paths; a second drift or a second failure on one task ends the turn with both reports.
6. **Review, then commit.** Dispatch one `general-purpose` delegate from `task-reviewer-prompt.md` on `sonnet`, or on `opus` when the diff touches concurrency, a security boundary or more than five files; it answers the spec questions and the standard's checks in one reading of the diff, because two contexts over one diff pay for that diff twice and split its findings. A BLOCK saves `git diff -- <Files: paths>` under the directory `git rev-parse --git-dir` prints, goes back to the build delegate, resumed, with the findings appended, then to the same reviewer from `re-review-prompt.md`, which scopes it to those findings and the fix hunks; a third round ends the turn with the findings. On PASS run the task's `Commit:` block as written, then `git push`. Report the landed task and the next under the closing rule in `using-exo`, then return to step 3.
7. **The tail.** With every task landed, run `code-review --fix` on the branch at `low` effort up to five changed files or 200 changed lines, `medium` above, and `high` when a task this turn carried `Design:`; commit and push its fixes. Then ask one question, each option on one line and the recommended one first: open the pull request and, once checks are green, ask the merge question; open it and stop; or the user opens it. On a PR: `gh pr create --base <default> --title --body-file` with the goal, the proof line and `Closes #<n>` on an `issue-<n>-<slug>` branch; on a merge yes run `merge-prs` Steps 2, 4 and 5. On an `issue-<n>-<slug>` branch name `/exo:ship-issue <n>` next.

## Red flags

| Thought | Reality |
|---|---|
| "I'll read the plan once to get the picture." | The frame plus one task is the picture; the rest is paid on every turn. |
| "This task is small, I'll build it here." | Small edits still fill the session; only a `Design:` task belongs here. |
| "`Run:` passed, skip the review." | `Run:` proves the command; the reviewer proves the task and the code. |
| "One commit at the end is cleaner." | The task's own commit, with its `Plan-task:` trailer, is how a cleared context finds where to resume. |

## References

| File | Read it when |
|---|---|
| `implementer-prompt.md` | Step 5, before every build dispatch. |
| `bug-fixer-prompt.md` | Step 5, before a dispatch on a failed `Run:` with no causal line. |
| `plan-author-prompt.md` | Step 5, before a dispatch on `PLAN DRIFT`. |
| `task-reviewer-prompt.md` | Step 6, before every review dispatch. |
| `re-review-prompt.md` | Step 6, before a reviewer's second or third round on one task. |

## Judgment

- Explicit user instructions outrank this skill; a named plan path outranks the search.
- The plan's settled decisions outrank implementation defaults: `planning` owns the plan's text, the build delegate owns the build, the reviewer owns its verdict, this skill owns routing and commits. A choice the plan leaves open and the user would not notice is ruled here and recorded in the commit body, never sent back as a question.
- Repository state outranks memory: only a `Plan-task:` commit on the branch decides what has landed, and after a compaction notice step 3 runs again before any edit.
