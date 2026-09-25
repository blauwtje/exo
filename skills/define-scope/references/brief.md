# The brief

A brief is the decided outcome, written in fixed sections a later session resumes from. The enemy is a brief that carries reasoning in place of decisions, so the next stage argues them again. The overcorrection is a section written for work that has none, such as a visual direction for a change with no screen.

## Sections

The brief holds these sections, in this order:

- **Goal:** one sentence describing the observable result.
- **Problem:** what goes wrong for the user today, seen from their side, in one or two sentences.
- **Decisions:** every decision with its answer and who closed it: you, the code with the path that settles it, or exo for a routine one.
- **Out of scope:** what a reader would otherwise assume is included.
- **Acceptance:** observable checks.
- **Proof:** the highest seam that can run the acceptance checks, the one closest to what the user does, and which checks it runs there.
- **Visual direction:** for a new visual surface only: whether the existing identity stays or may be replaced, the ambition, and who chooses between rendered directions; when the frontend-design skill returns, the path of its `contract-selected.json` with the contract's `title` and `description`.

`docs` writes `docs/specs/<topic>.md` in these section names.

## Judgment

- `Visual direction` keeps that exact name, because the design-ui skill reads the brief's `## Visual direction`.
- A brief whose `## Visual direction` names an existing `contract-selected.json` hands the frontend-design skill a decided direction; it resumes at Build and repeats no variant choice.
