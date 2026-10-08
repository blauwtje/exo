# The brief

Brief = the decided outcome, in fixed sections a later session resumes from. The enemy is a brief carrying reasoning in place of decisions, so the next stage argues them again. The overcorrection is a section for work that has none, such as a visual direction for a change with no screen.

## Sections

In this order:

- **Goal:** one sentence describing the observable result.
- **Decisions:** every bin-1 decision with its answer and who closed it: you, the code with the path that settles it, or exo for a second "I don't know".
- **Open points:** only while a question or assumption the user has still to confirm remains; one list item each, none for a point Decisions closed. Entry listed → the handoff recommends adjusting the brief.
- **Acceptance:** the observable checks and the highest seam that runs them, the one closest to what the user does.
- **Manual checks:** only when a check needs the user's own eyes, hands or account; one line per check; `build` ends its final report with them.
- **Visual direction:** new visual surface only: whether the existing identity stays or may be replaced, the ambition, who chooses between rendered directions.
  - Frontend-design skill returns → add the path of its `contract-selected.json` with the contract's `title` and `description`.
- **Plan basis**, **Success criterion**, **Checkpoint**, **Tasks**, in that order, each as the task-list specification defines it.
- Tasks stays last; a `## ` heading after a task ends that task.

Store the brief where `specs` in the session's `exo settings:` line says, `docs` when that line is absent, and name its location in the same message.

## The task list

- Make the split and every design choice before writing the list; the builder runs on `sonnet` and cannot ask.
- Choice the user would notice → Decisions.
- Exception, open visual choice → its task carries `Design: design-ui`; `build` routes it by the brief's Visual direction.

## Judgment

- `Open points` keeps that exact name; the handoff script reads `## Open points` to pick its recommendation.
- `Visual direction` keeps that exact name; design-ui reads the brief's `## Visual direction`.
- `## Visual direction` names an existing `contract-selected.json` → design-ui gets a decided direction; it resumes at Build and repeats no variant choice.
