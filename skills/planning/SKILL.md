---
name: planning
description: Produce a machine-executable plan before implementation and govern any read-only planning mode. Use when that mode is active, the user asks for a plan or a handoff, another session or executor will run the work, or inspection finds two or more edit-order dependencies. Not for same-session work with at most one dependency edge and no plan request; one-file, typo-only, rename-only, or version-bump edits; git-only operations; proving an active failure outside a planning turn; or an architecture audit, which deepen owns even in planning mode.
---

# Planning

Turn a request into a plan another mind can execute without interpretation. The enemy is the plan that restates intent and exports discovery to the executor. The overcorrection is a full edit specification for two edits the current session can order in two lines.

## Activation gate

Draw `A → B` when B cannot build, test, or preserve data before A lands. Run this skill when a read-only planning mode is active, the user asks for a plan, a different session or executor will run the work, or the graph contains at least two edges. Zero or one edge for this session belongs in `implementing-batch`. When this session executes, nobody asked for a plan, and an upstream `shaping` brief lists every edge and places A before B for each one, use that order without running this skill.

## Intake

Before any planning:

- Restate the actual goal in one sentence; plan against that restatement, not the prompt's phrasing.
- Resolve a vague referent from the first non-empty source: working-tree diff, most recent failing check, then last touched file.
- Separate hard requirements from incidental wording; record what the plan will not do as explicit non-goals.
- Decide every choice the user would not notice and record it in the plan; do not interview.
- Ask, before writing, only what blocks planning: the first non-empty source holds two or more candidate referents and the request names no discriminator, or a choice changes persisted data, a public protocol or signature, a paid provider, or an irreversible deletion or migration. Attach a recommendation. The written plan carries no open question.

An outcome with no chosen solution borrows `shaping` for its product and architecture decisions; the resulting brief folds into the plan's Context rather than a separate file.

## Investigate

Delegate locating the files, symbols, and call sites the plan will name to a `general-purpose` delegate from `../research/scout-prompt.md`, then confirm each here by reading only the range around it: a session that greps the tree or opens whole files carries that output into every later turn. A name not read this session may not appear in a step. For a deliverable plan, write each step's code in full while the file is open: the executor pastes it, so this session writes it. While a read-only planning mode is active, run only commands that leave the working tree unchanged; when proof requires an edit, make it the plan's first step.

Discovery is the only work this skill delegates. This session chooses the design, orders the tasks, and writes the artifact: a delegated design comes back whole and names files this session never read. A delegated context may critique a finished ordering, never author one.

Code a deliverable plan carries has run once before the plan names it. Delegate that pre-run to a `general-purpose` context with the plan path, a scratch directory outside the working tree, and a stop condition: it copies the files there, applies each step's code, runs each `Run:` into a log, and returns one line per task with the result and log path, which `## Plan basis` records along with any task a missing service, build, or browser left unrun. A first run under the executor makes the executor the debugger, the role the plan exists to remove; a pre-run in this context carries every edit and log into the plan's own turns.

## Depth

| Executor | Output |
|---|---|
| This session continues straight into the edits and nobody asked for a plan | Inline: at most 20 lines in the current message with ordered steps, affected paths, each edge's reason, and the final verification. |
| A read-only planning mode, a requested plan, or another executor | Deliverable: the artifact `references/handoff-spec.md` defines, written to the harness-designated plan file when one exists, otherwise `docs/plans/<topic>.md`. |

A deliverable plan is never message-only: a fresh session with zero context must be able to open the artifact and execute it. Update an existing plan for the same topic rather than creating a sibling, and extend it with edits rather than rewriting the file, because a rewrite re-enters every task into the context.

Before ending the turn, read the plan once against the rules in `references/handoff-spec.md`: a step without code, a step without `Run:` and `Expected:`, a task without its `Commit:` block, or any placeholder is repaired now, because the executor cannot.

## References

| File | Read it when |
|---|---|
| `references/handoff-spec.md` | Before writing any plan deliverable: a planning-mode plan file, a requested plan, or a handoff document. Do not load for the inline row. |
| `references/example-handoff.md` | Once, before composing the first task of a deliverable plan; do not load for the inline row. |
| `../implementing-batch/references/data-migration.md` | After affected paths are known and before ordering, only when work changes a database schema, persisted-data or file format, backfill, destructive DDL, persisted-data deletion, or compatibility between concurrently deployed versions. In-memory types, cache rebuilds, and version-only dependency bumps do not qualify. |
| `../research/scout-prompt.md` | Before a codebase discovery dispatch. |

## Judgment

- While a read-only planning mode is active, this skill owns the turn. The one exception is an architecture audit, which `deepen` owns while still writing the plan artifact this skill defines. `shaping` decides product and architecture, the frontend-design skill the executing session has loaded decides visual direction, `research` confirms external behavior, and each hands control back into the plan. Here that skill is `designing`: `## Visual direction` records `Design skill: designing`, a task with a `Design:` line schedules the build, and the plan never restates that skill's quality floor.
- A specialist's brief, audit, or selected direction is intermediate input: this skill compiles those decisions into the persisted artifact, and a specialist ending its own workflow never ends the planning turn.
- An unproven failure inside a planning turn makes reproduction and proof the plan's first phase; plan no fix past the proof point. Outside a planning turn, `debug` outranks planning until the cause is proven.
- The executor and edge count set depth; a requested depth outranks both, and a requested plan outranks the upstream-order skip.
- Repository verification and documentation conventions outrank unspecified defaults.
- A deliverable plan ends the turn: the reply names the plan path and the task count, never the plan text, and execution starts under `implementing` in a fresh context.
- After a compaction notice, list the written tasks with `grep -n '^### Task [0-9]' <plan-file>` before adding another; the file, not memory, records what the plan already holds.
