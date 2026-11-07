# Plan-wide checks

The `exo:review-branch` agent reads this page to catch faults that only show across the whole plan. It applies when the plan holds pasted code, the scope is `overlap`, or the dispatch names no scope.

- A defect in plan-pasted code is a `question` marked `report`, naming the task and the breaking input.
- Check the plan for a goal it leaves undelivered (missing), a hunk or path that serves no goal or crosses a non-goal (extra), and commits that disagree on a name, signature or reference (seam).
- When a `<plan stem>-decisions.md` file sits beside the plan, a choice that crosses a goal or non-goal is a finding.
- Read only the heading and field lines of the plan tasks: `grep -nE '^### Task [0-9]+:|Files:|Proof:|^Run:' <plan>`.
- A task with no naming commit or proof is a `defect` marked `report`.

## Changed tests

- A deleted test, removed or loosened assertion or added skip marker is a `defect` marked `report`, quoting the removed text, unless a plan non-goal or the task names it.
