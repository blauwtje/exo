# The brief

A brief is the decided outcome, written in fixed sections a later session resumes from. The enemy is a brief that carries reasoning in place of decisions, so the next stage argues them again. The overcorrection is a section written for work that has none, such as a visual direction for a change with no screen.

## Sections

The brief holds these sections, in this order:

- **Goal:** one sentence describing the observable result.
- **Decisions:** every bin-1 decision with its answer and who closed it: you, the code with the path that settles it, or exo for a second "I don't know".
- **Acceptance:** the observable checks and the highest seam that runs them, the one closest to what the user does.
- **Manual checks:** only when a check needs the user's own eyes, hands or account: one line per check, which `build` ends its final report with.
- **Visual direction:** for a new visual surface only: whether the existing identity stays or may be replaced, the ambition, and who chooses between rendered directions; when the frontend-design skill returns, the path of its `contract-selected.json` with the contract's `title` and `description`.
- **Plan basis:** `Repository: <absolute root>` and `Branch: <branch>` lines, so `build` matches the brief to a checkout, plus `Worktree setup: <command>` or `Worktree setup: none` once two tasks share no dependency chain.
- **Success criterion:** the one command that proves every task landed.
- **Checkpoint:** the four points `Blocks first:`, `Parallel:`, `Shared state:` and `Smallest safe split:`, each naming tasks, a shared target or `none`.
- **Tasks:** last, because a `## ` heading after a task ends that task; the task template and its per-task rules follow the skill's References row for it.

Store the brief where `specs` in the session's `exo settings:` line says, `docs` when that line is absent, and name its location in the same message. `docs` writes `docs/specs/<topic>.md` in these section names.

## The task list

- You make the split and every design choice before the list is written, because the builder runs on `sonnet` and cannot ask.
- A choice the user would notice goes to Decisions, a routine one the user would not notice to the task's `Data:` segment.
- The exception is an open visual choice: its task carries `Design: design-ui`, and `build` routes it by the brief's Visual direction.
- The heading is the commit subject the run lands the task with, so it names one concern.

## Judgment

- `Visual direction` keeps that exact name, because the design-ui skill reads the brief's `## Visual direction`.
- A brief whose `## Visual direction` names an existing `contract-selected.json` hands `design-ui` a decided direction; it resumes at Build and repeats no variant choice.
