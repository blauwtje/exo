---
name: implementing
description: Use when a session opens on a plan file to run, after a clear, or when the user says to run or resume a plan. Not for authoring or repairing a plan, a decided change with no plan file, or a checkpoint that must build in this session, which `implementing-batch` owns.
---

# Implementing a plan

Run a plan checkpoint by checkpoint through delegated contexts, so the session that commits stays small. The enemy is reading the whole plan or building in the session: both spend the context the review and the pull request need. The overcorrection is delegating a decision: an `OPEN` or `DESIGN` checkpoint needs a judgment only the session can make.

Invoking `/exo:implementing` on a plan authorizes the branch its `## Plan basis` names under `Branch:`, commits and pushes on that branch, and the review's fixes; a pull request only after your yes, a merge only after a second yes, and nothing else.

## When to use

- A session opens on a plan written by `planning`, or the user says to run or resume one.
- Not for writing or repairing the plan (`planning`), a change without a plan (`implementing-batch`), or a failure whose cause is unproven (`debug`).

## The loop

1. **Resolve the plan, then the branch.** Use the path the user named; without one, take the plan under `docs/plans/` or `~/.claude/plans/` whose `Repository:` line equals `git rev-parse --show-toplevel`, prefer one whose `Branch:` equals the current branch, and name the pick. On the default branch while `Branch:` names another, `git switch -c <Branch:>` and `git push -u origin <Branch:>`; on the default branch while `Branch:` names it too, branch as `<type>/<slug>` from the plan's goal; any other branch stops with a report.
2. **Read the frame, not the plan.** Read `## Goal`, `## Plan basis`, `## Non-goals`, `## Context` and `## Visual direction`, then list the ids with `grep -n '^### ' <plan>`; never open the whole file and never `@`-reference it.
3. **Ask the repository what landed.** Walk the ids in file order: a checkpoint has landed when every `create:` path exists and, per `replace:` entry, its `with:` text is present and its `replace:` text absent; one with `Touches: none` has landed when its `Done when:` holds. The first unlanded id whose `Depends on:` all landed is current; all landed sends you to step 7.
4. **Extract that checkpoint alone** with `sed -n` between its `### ` heading and the next, and route on its `Freedom:` line.
5. **Dispatch the build.** `LOCKED` and `GUIDED` go to `implementer` with a brief written from `references/implementer-brief.md`. `OPEN` builds here under `implementing-batch`, handed the checkpoint as the settled plan; `DESIGN` builds here under `designing` from its Build phase, or ends the turn when `## Visual direction` records no direction. A `PLAN DRIFT` report goes to `plan-author` with the plan path, the id and the mismatch, then step 4 repeats; a failed `Verify:` whose output names no causal line goes to `bug-fixer` with the command, the log path and the paths; a second drift or a second failure on one checkpoint ends the turn with both reports.
6. **Review, then commit.** Dispatch `spec-reviewer` from `references/spec-review-brief.md` and, on PASS, `quality-reviewer` from `references/quality-review-brief.md`. A BLOCK goes back to `implementer` with the findings, then to the same reviewer again; a third round ends the turn with the findings. On PASS twice: `git add` the `Touches:` paths, a Conventional Commit with no attribution whose body carries the checkpoint's rationale, and `git push`. Report the landed id and the next id, then return to step 3.
7. **The tail.** With every id landed, run `code-review --fix` on the branch at `medium` effort when only `LOCKED` checkpoints landed this turn, else `high`; commit and push its fixes. Ask one question with three options: open the pull request and, once checks are green, ask the merge question; open it and stop; or the user opens it. On a PR: `gh pr create --base <default> --title --body-file` with the goal, the proof line and `Closes #<n>` on an `issue-<n>-<slug>` branch; on a merge yes run `merge-prs` Steps 2, 4 and 5. On an `issue-<n>-<slug>` branch name `/exo:ship-issue <n>` next.

## Red flags

| Thought | Reality |
|---|---|
| "I'll read the plan once to get the picture." | The frame plus one checkpoint is the picture; the rest is paid on every turn. |
| "This checkpoint is small, I'll build it here." | Small edits still fill the session; only `OPEN` and `DESIGN` belong here. |
| "`Verify:` passed, skip the reviews." | `Verify:` proves the command; the reviewers prove the checkpoint and the code. |
| "One commit at the end is cleaner." | A commit per checkpoint is the handoff a cleared context resumes from. |

## References

| File | Read it when |
|---|---|
| `references/implementer-brief.md` | Step 5, before every `implementer` dispatch. |
| `references/spec-review-brief.md` | Step 6, before every `spec-reviewer` dispatch. |
| `references/quality-review-brief.md` | Step 6, before every `quality-reviewer` dispatch. |

## Judgment

- Explicit user instructions outrank this skill; a named plan path outranks the search.
- The plan's settled decisions outrank implementation defaults: `planning` owns the plan's text, `implementer` owns the build, the reviewers own their verdicts, this skill owns routing and commits.
- Repository state outranks memory: only `Edit:` text found or missing in the working tree decides what has landed, and after a compaction notice step 3 runs again before any edit.
