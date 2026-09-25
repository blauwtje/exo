---
name: draft-plan
description: Use when a read-only planning mode is active, a plan is requested, another session runs the work, or edits have two or more order dependencies. Not for same-session work with at most one dependency, one-file edits, git-only work, an unproven failure outside planning mode, or an architecture audit.
argument-hint: <what to plan, a spec path, or an issue number> [--run]
---

# Planning

Turn a request into a plan another mind can execute without interpretation. The enemy is the plan that restates intent and exports discovery to the executor. The overcorrection is a full edit specification for two edits the current session can order in two lines.

## Activation gate

Draw `A → B` when B cannot build, test, or preserve data before A lands. Zero or one edge for this session belongs in `build-change`. When this session executes, nobody asked for a plan, and an upstream `define-scope` brief lists every edge and places A before B for each one, use that order without running this skill.

## Intake

- Restate the actual goal in one sentence; plan against that restatement, not the prompt's phrasing.
- Resolve a vague referent from the first non-empty source: working-tree diff, most recent failing check, then last touched file.
- Separate hard requirements from incidental wording; record what the plan will not do as explicit non-goals.
- Decide every choice the user would not notice and record it in the plan; do not interview.
- Read an issue reference, `#<n>` or an issue URL, with `gh issue view <n> --json number,title,body,url`: a body whose first line is `<!-- exo:spec -->` is a shaped brief, planned as a spec file would be and never shaped again, and the plan's `## Goal` names `#<n>` so the finished pull request closes it.
- Ask, before writing, only what blocks planning: the first non-empty source holds two or more candidate referents and the request names no discriminator, or a choice changes persisted data, a public protocol or signature, a paid provider, or an irreversible deletion or migration. Attach a recommendation. The written plan carries no open question.

An outcome with no chosen solution borrows `define-scope` for its product and architecture decisions; the resulting brief folds into the plan's Context rather than a separate file.

## Investigate

Run `node "${CLAUDE_SKILL_DIR}/scripts/repo-map.mjs"` before any dispatch and read the file at the path it prints: tracked paths with the exported names of their JavaScript and TypeScript files. It writes only under the git directory, so a read-only planning mode runs it too; outside a git repository it prints one `no map` line and discovery starts at the dispatch.

Discovery beyond the map goes to the `exo:locate-code` agent by default, briefed with the files, symbols and call sites the plan will name and told to quote the range around each, never a path the map names. Reading here is the exception, at most eight direct reads before the plan file is first written, each of one name's range, never source printed with `cat`, `head` or `sed`, and a saved tool result only by grep or at most 40 lines; the rest goes to `exo:locate-code`, because output read here rides in every later turn. A name reaches a step only after its range was read, here or in that report. For a deliverable plan, write each step's code in full while the range is in view: the executor pastes it. While a read-only planning mode is active, run only commands that leave the working tree unchanged; when proof requires an edit, make it the plan's first step.

A plan of two or more phases is written a phase at a time. This session writes `## Goal`, `## Plan basis`, `## Non-goals`, `## Context` and one line per phase, because it owns the order, and designs no task, file or test, which would ride in every later turn. Each phase goes, in list order, to a fresh `general-purpose` delegate on the session's model. Its brief names the plan path, the phase, earlier returns and the task-timed References rows, read there only. It finds code through `exo:locate-code`, appends its tasks with `Edit`, keeps findings in the plan, and returns at most 10 lines, only `PHASE <n>: OK|FAIL`, an `exports: <name> <path>` per name later phases need, and `open: <one line at most>`. A delegate may critique a finished order, never author one.

A task whose path crosses a security boundary names that reference in its own heading or `Data:` clause, never as a warning left for later: the builder reads the named files and the reference together before it writes a line.

Do not pre-run the plan: writing the code now means the builder writes it again. `## Success criterion` names the one proof this session could not already show; the task's own build supplies the rest.

## Depth

| Executor | Output |
|---|---|
| This session continues straight into the edits and nobody asked for a plan | Inline: at most 20 lines in the current message with ordered steps, affected paths, each edge's reason, and the final verification. |
| A read-only planning mode, a requested plan, or another executor | Deliverable: the artifact `references/plan-spec.md` defines, written to the harness-designated plan file when one exists, otherwise `docs/plans/<topic>.md`. |

A deliverable plan is never message-only: a fresh session with zero context must be able to open the artifact and execute it. Update an existing plan for the same topic rather than creating a sibling, and extend it with edits rather than rewriting the file, because a rewrite re-enters every task into the context.

Before ending the turn, run `node "${CLAUDE_SKILL_DIR}/scripts/plan-check.mjs" --plan <plan path>` and repair each line it prints, because a missing `Files:` segment, a `## Checkpoint` short a point, or a plan past 30 non-blank lines reads from the file, not from memory. Then check the brief's acceptance list against the plan: an item that reaches no task heading, `Data:` clause or `## Success criterion` is repaired now, because the executor cannot.

## Handing it over

With `--run`, the same turn continues into `run-plan` on the written plan instead of asking. Otherwise a deliverable plan ends the turn on `node "${CLAUDE_SKILL_DIR}/../route-skills/scripts/next-stage.mjs" --after draft-plan --artifact <plan path>`'s output: the reply names the plan path and the task count, never the plan text, then that output.

## References

| File | Read it when |
|---|---|
| `references/plan-spec.md` | Before writing a deliverable plan; never for the inline row. |
| `references/example-plan.md` | Once, before the first task of a deliverable plan. |
| `../build-change/references/data-migration.md` | After affected paths are known and before ordering, only when work changes a database schema, persisted-data or file format, backfill, destructive DDL, persisted-data deletion, or compatibility between concurrently deployed versions. In-memory types, cache rebuilds, and version-only dependency bumps do not qualify. |
| `../build-change/references/test-design.md` | Before composing the first task, to decide which tasks are risky and therefore write their test first. |
| `../build-change/references/security.md` | After affected paths are known and before ordering, only when changed behavior crosses authentication/authorization; tenant/resource ownership; secrets/credentials; untrusted input; network, file, or process execution; cryptography; or payments/regulated-data boundaries. Filenames and dependency names alone do not qualify. |
| `../route-skills/references/question.md` | Before a message that asks the user to pick among numbered options, other than the next-stage question the script prints. |

## Judgment

- While a read-only planning mode is active, this skill owns the turn. The one exception is an architecture audit, which `audit-architecture` owns while still writing the plan artifact this skill defines. `define-scope` decides product and architecture, the frontend-design skill the executing session has loaded decides visual direction, `check-docs` confirms external behavior, and each hands control back into the plan. Here that skill is `design-ui`: a task's `Design:` field schedules its build, and the plan never restates that skill's quality floor.
- A specialist's brief, audit, or selected direction is intermediate input: this skill compiles those decisions into the persisted artifact, and a specialist ending its own workflow never ends the planning turn.
- An unproven failure inside a planning turn makes reproduction and proof the plan's first phase; plan no fix past the proof point. Outside a planning turn, `find-cause` outranks draft-plan until the cause is proven. Each hypothesis tried before the cause is proven, kept or reverted, is named in the proof task's `Data:` clause with the evidence that decided it: the fix step is the conclusion, not the trail that reached it.
- An internal migration outside `../build-change/references/data-migration.md`'s scope — in-memory types, a client library swap, an internal API surface — orders tasks toward the end architecture directly; a task earns a compatibility layer only where that reference requires one for persisted data, because that is the one case where intermediate compatibility outranks convergence.
- Two tasks with `Depends on: none` between them that would write the same file, key, or branch get that target split — one file or section per task — before they stand as independent; only a real shared invariant earns a `Depends on:` edge that serializes them instead.
- The executor and edge count set depth; a requested depth outranks both, and a requested plan outranks the upstream-order skip.
- Repository verification and documentation conventions outrank unspecified defaults.
- After a compaction notice, list the written tasks with `grep -n '^### Task [0-9]' <plan-file>` before adding another; the file, not memory, records what the plan already holds.
