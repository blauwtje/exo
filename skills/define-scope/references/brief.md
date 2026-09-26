# The brief

A brief is the decided outcome, written in fixed sections a later session resumes from. The enemy is a brief that carries reasoning in place of decisions, so the next stage argues them again. The overcorrection is a section written for work that has none, such as a visual direction for a change with no screen.

## Sections

The brief holds these sections, in this order:

- **Goal:** one sentence describing the observable result.
- **Decisions:** every bin-1 decision with its answer and who closed it: you, the code with the path that settles it, or exo for a second "I don't know".
- **Assumptions:** every bin-3 point as one line each, so a later correction costs one sentence.
- **Acceptance:** the observable checks and the highest seam that runs them, the one closest to what the user does.
- **Visual direction:** for a new visual surface only: whether the existing identity stays or may be replaced, the ambition, and who chooses between rendered directions; when the frontend-design skill returns, the path of its `contract-selected.json` with the contract's `title` and `description`.
- **Plan basis:** `Repository: <absolute root>` and `Branch: <branch>` lines, so `run-plan` matches the brief to a checkout, plus `Worktree setup: <command>` or `Worktree setup: none` once two tasks share no dependency chain.
- **Success criterion:** the one command that proves every task landed.
- **Checkpoint:** the four points `Blocks first:`, `Parallel:`, `Shared state:` and `Smallest safe split:`, each naming tasks, a shared target or `none`.
- **Tasks:** last, because a `## ` heading after a task ends that task; the task template and its per-task rules follow the skill's References row for it.

`docs` writes `docs/specs/<topic>.md` in these section names.

## The task list

- You make the split and every design choice before the list is written, because the builder runs on `sonnet` and cannot ask.
- A choice the user would notice goes to Decisions, a routine one to Assumptions or the task's `Data:` segment.
- The exception is an open visual choice: its task carries `Design: design-ui`, and `run-plan` routes it by the brief's Visual direction.
- The heading is the commit subject the run lands the task with, so it names one concern.

## Judgment

- `Visual direction` keeps that exact name, because the design-ui skill reads the brief's `## Visual direction`.
- A brief whose `## Visual direction` names an existing `contract-selected.json` hands the frontend-design skill a decided direction; it resumes at Build and repeats no variant choice.
