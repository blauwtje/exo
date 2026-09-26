---
name: define-scope
description: "Use when a request, or new wishes for a stored brief, issue or plan, leaves a product decision open: what counts as done, data, architecture or a trade-off. When a new visual surface does not name its displayed data, settings, or behavior, define-scope decides those first; design-ui follows for presentation. Not for a clear goal, a failure, or visual-only work."
argument-hint: <outcome to shape>
---

# Shaping

## Steps

1. **Gate.** Zero open decisions means leave this skill and write no brief; hand the goal to `build-change`.
   An open decision is one the user would notice that neither request nor code settles.
   The exception is two or more order dependencies, B unable to build, test or keep its data before A lands: write the brief unasked, from step 4 on.
   Asked for options, give directions, recommended first, and write no file.
   New wishes for briefed work reopen that brief, since two briefs for one outcome drift apart.
2. **Sort each open point.** Ask only what is costly or irreversible, the root other decisions hang on first.
   Costly means stored data format, a public interface, a paid service, a deletion, or access rights and security.
   A point answerable by running something goes to `try-idea` and returns as a decision.
   Decide the routine, a visible but cheap point included, and list it as an assumption.
   A decision the user left undecided stays open whatever the code suggests.
   Name the owning layer and any smaller alternative.
3. **Ask once.** Read `references/question-shape.md`, then bundle all costly questions and assumptions into one message in its shape.
   With assumptions but no costly question, write the brief unasked; with neither, step 1 applies.
   After a compaction, list the decisions so far before the next message.
4. **Map, then locate.** Run `node "${CLAUDE_SKILL_DIR}/scripts/repo-map.mjs"`, plan mode included, and read the file at the path it prints.
   Discovery beyond the map goes to the `exo:locate-code` agent, quoting the range around each file, symbol and call site the tasks will name.
   Read at most eight ranges here, never through `cat`, `head` or `sed`, since each read rides in every later turn.
5. **List tasks** in the grammar `references/task-list.md` sets.
   A task crossing a security boundary names the security reference in its heading or `Data:` segment, so the builder reads it first.
   Plan mode runs only commands that leave the working tree unchanged; a proof needing an edit makes that edit the first task.
6. **Store it.** Store the brief where `specs` in the session's `exo settings:` line says, `docs` when that line is absent, and name its location in the same message.
   The exception is plan mode: the brief goes into the plan file the harness names.
   `docs` writes `docs/specs/<topic>.md`; `issues` and `both` follow `references/brief-in-an-issue.md`.
   `issues` also writes the brief to the path `node "${CLAUDE_SKILL_DIR}/../../lib/scratch-path.mjs" specs/<n>.md` prints, the copy `run-plan` runs.
7. **Check it.** Run `node "${CLAUDE_SKILL_DIR}/scripts/plan-check.mjs" --plan <brief file>` and repair each line it prints.
   Then repair any Acceptance item that reaches no task heading, `Data:` segment, Success criterion or `## Manual checks` line, because the builder cannot.
8. **Hand off.** Load `exo:run-plan` on that file with the Skill tool, in this turn and unasked, because the context watch reads a plan run from that load.
   The exception is a read-only planning mode: end on the output of `node "${CLAUDE_SKILL_DIR}/../route-skills/scripts/next-stage.mjs" --after define-scope --artifact <brief path, or #<n> for an issue>`.

## References

| File | Read it when |
|---|---|
| `references/stored-brief.md` | The request names or extends a brief, issue or plan. |
| `references/question-shape.md` | Step 3, and again when a reply arrives. |
| `references/brief.md` | Before writing the brief. |
| `references/task-list.md` | Before writing the task list. |
| `references/example-plan.md` | Once, before the first task. |
| `../build-change/references/data-migration.md` | When its first line applies. |
| `../build-change/references/test-design.md` | When its first line applies. |
| `../build-change/references/security.md` | When its first line applies. |
| `references/brief-in-an-issue.md` | `specs` is `issues` or `both`. |
| `../file-issues/references/fields.md` | Before creating that issue. |
| `references/architecture-sketch.md` | Two or more structural shapes compete. |

Report: the brief's location and the next stage, or the bundled questions and assumptions.
