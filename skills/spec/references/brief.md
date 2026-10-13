# The brief

Brief = decided outcome, in fixed sections a later session resumes from. Sections hold decisions, not their reasoning.

## Sections

In this order:

- **Goal:** the observable result, in one sentence.
- **Decisions:** every bin-1 decision with its answer, closed by you, the code with its settling path, or exo for a second "I don't know" or small work.
- **Non-goals:** what a reader would assume is included, one bullet each naming its paths; none → omit.
- **Open points:** only an unanswered question for the user; one list item each. Entry listed → plan-check flags it and build refuses the brief.
- **Assumptions:** each `code` or `assume` point.
- **Acceptance:** the observable checks and the highest seam running them, the one closest to what the user does.
- **Manual checks:** only when a check needs the user's own eyes, hands or account; one line per check; the run report holds them, not the final message.
- **Visual direction:** new visual surface only: whether the existing identity stays or may be replaced, the ambition, who chooses between rendered directions.
  - Frontend-design skill returns → add the path of its `contract-selected.json` with the contract's `title` and `description`.
- **Plan basis**, **Success criterion**, **Checkpoint**, **Tasks**, each as the task-list specification defines it.
- Tasks stays last; a `## ` heading after a task ends that task.

Store the brief where `specs` in the session's `exo settings:` line says, `docs` when that line is absent, and name its location in the same message.

- `docs` → `docs/specs/<topic>.md`; plan mode → the harness plan file.

## The task list

- Make the split and every design choice before writing the list.
- Choice the user would notice → Decisions.
- Point the user would not notice → `Data:`.
- Security-boundary task → name its reference in its heading or `Data:`.
- Plan mode → an edit-needing proof is Task 1.
- A task touching sandbox, deny rules, breach detection, task pin, land-task, or code deleting files or branches → `Risk: security boundary`.
- Exception, open visual choice → its task carries `Design: design-ui`; `build` routes it by the brief's Visual direction.

## Judgment

- `## Open points` keeps that exact name.
- `## Visual direction` (exact name; design-ui reads it) names an existing `contract-selected.json` → design-ui gets a decided direction; it resumes at Build and repeats no variant choice.

## Open points step

Dispatch the `exo:find-open-points` agent once on the brief.

- `code` point → its answer under `## Assumptions`; ask nothing.
- `assume` point → `## Assumptions`; ask nothing.
- `user` point → ask it, one per message.
- Each answer → next numbered line under `## Decisions`, closed by you; store it with `node "${CLAUDE_SKILL_DIR}/../remember/scripts/memory.mjs" write --decision --claim "<the decision>" --refs "<path,path>"`.
- Unanswered `user` point → `## Open points`; no entry left → omit the section.
