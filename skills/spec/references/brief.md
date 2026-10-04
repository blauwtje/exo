# The brief

A brief is the decided outcome, written in fixed sections a later session resumes from. The enemy is a brief that carries reasoning in place of decisions, so the next stage argues them again. The overcorrection is a section written for work that has none, such as a visual direction for a change with no screen.

## Sections

The brief holds these sections, in this order:

- **Goal:** one sentence describing the observable result.
- **Decisions:** every bin-1 decision with its answer and who closed it: you, the code with the path that settles it, or exo for a second "I don't know".
- **Open points:** only while a question or an assumption the user has still to confirm remains, one list item each, none for a point Decisions closed; the handoff recommends adjusting the brief while this section lists an entry.
- **Acceptance:** the observable checks and the highest seam that runs them, the one closest to what the user does.
- **Manual checks:** only when a check needs the user's own eyes, hands or account: one line per check, which `build` ends its final report with.
- **Visual direction:** for a new visual surface only: whether the existing identity stays or may be replaced, the ambition, and who chooses between rendered directions.
  - When the frontend-design skill returns, add the path of its `contract-selected.json` with the contract's `title` and `description`.
- **Plan basis**, **Success criterion**, **Checkpoint** and **Tasks**, in that order, each as the task-list specification defines it.
- Tasks stays last, because a `## ` heading after a task ends that task.

Store the brief where `specs` in the session's `exo settings:` line says, `docs` when that line is absent, and name its location in the same message.

## The task list

- You make the split and every design choice before the list is written, because the builder runs on `sonnet` and cannot ask.
- A choice the user would notice goes to Decisions.
- The exception is an open visual choice: its task carries `Design: design-ui`, and `build` routes it by the brief's Visual direction.

## Judgment

- `Open points` keeps that exact name, because the handoff script reads `## Open points` to pick its recommendation.
- `Visual direction` keeps that exact name, because the design-ui skill reads the brief's `## Visual direction`.
- A brief whose `## Visual direction` names an existing `contract-selected.json` hands `design-ui` a decided direction; it resumes at Build and repeats no variant choice.
