# Plan-wide checks

The `exo:review-branch` agent reads this when the plan holds pasted code, the scope is `overlap`, or the dispatch names no scope.

- Plan-pasted code defect → `question` marked `report`, naming task and breaking input.
- Plan: goal undelivered (missing); hunk or path serving no goal or crossing non-goal (extra); commits disagreeing on name, signature, reference (seam).
- `<plan stem>-decisions.md` beside plan → choice crossing goal or non-goal = finding.
- Plan tasks → read only heading, field lines: `grep -nE '^### Task [0-9]+:|Files:|Proof:|^Run:' <plan>`.
- A task with no naming commit or proof → `defect` marked `report`.
