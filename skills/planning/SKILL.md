---
name: planning
description: Produce a machine-executable plan before implementation and govern any read-only planning mode. Use when that mode is active, the user asks for a plan or a handoff, another session or executor will run the work, or inspection finds two or more edit-order dependencies. Not for same-session work with at most one dependency edge and no plan request; one-file, typo-only, rename-only, or version-bump edits; git-only operations; proving an active failure outside a planning turn; or an architecture audit, which deepen owns even in planning mode.
---

# Blueprint

Turn a request into a plan another mind can execute without interpretation. The enemy is the plan that restates intent and exports discovery to the executor. The overcorrection is a full edit specification for two edits the current session can order in two lines.

## Activation gate

Draw `A → B` when B cannot build, test, or preserve data before A lands. Run this skill when a read-only planning mode is active, the user asks for a plan, a different session or executor will run the work, or the graph contains at least two edges. Zero or one edge for this session belongs in `implementing-batch`. When this session executes, nobody asked for a plan, and an upstream `shaping` brief lists every edge and places A before B for each one, use that order without running this skill.

## Intake — distill the request

Assume the prompt is lazy, or long and noisy. Before any planning:

- Restate the actual goal in one sentence; plan against that restatement, not the prompt's phrasing.
- Resolve a vague referent from the first non-empty source: working-tree diff, most recent failing check, then last touched file.
- Separate hard requirements from incidental wording; record what the plan will not do as explicit non-goals.
- Turn every unresolved default into a stated assumption inside the plan; do not interview.
- Ask a question only when it blocks planning: the first non-empty source holds two or more candidate referents and the request names no discriminator, or a choice changes persisted data, a public protocol or signature, a paid provider, or an irreversible deletion or migration. Attach a recommendation.

An outcome with no chosen solution borrows `shaping` for its product and architecture decisions; the resulting brief folds into the plan's Context rather than a separate file.

## Investigate — never plan on guessed structure

Delegate locating the files, symbols, and call sites the plan will name to `codebase-scout`, then confirm each here by reading only the range around it with an offset and a limit: a planning session that greps the tree or opens whole files carries that output into every later turn of the plan. A name not read this session may not appear in a step; write `[NEEDS CLARIFICATION: ...]` instead of inventing one. For a deliverable plan, copy the exact text each edit replaces while the file is open: the plan carries the edit as code the executor pastes, so the planning session, not the executor, writes it. While a read-only planning mode is active, run only commands that leave the working tree unchanged; when proof requires an edit, make that edit the plan's first step rather than performing it now.

Discovery is the only work this skill delegates. The planning session itself chooses the design, orders the checkpoints, and writes the artifact: a design written in a delegated context comes back whole, so it saves nothing here, and it names files this session never read. A delegated context may critique a finished ordering; it never authors one.

Code a deliverable plan carries has run once before the plan names it. Delegate that pre-run to a delegated context (`general-purpose`, given the plan path, a scratch directory outside the working tree, and a stop condition): it copies the touched files there, applies each checkpoint's `Edit:` text, runs each `Verify:` command with its output redirected to a log, and returns one line per checkpoint with the result and the log path, which `## Plan basis` records. Code whose first run happens under the executor turns the executor into the debugger, the role the plan exists to remove, and a pre-run in the planning context carries every edit and log into the plan's own turns: plan sessions measured a median 297k tokens on 2026-09-07. When a service, build, or browser the copy cannot provide gates that run, `## Plan basis` names the checkpoints whose code is unrun.

After affected paths are known and before ordering, apply the data-migration row in References. Do not load it during initial orientation.

## Depth

| Executor | Output |
|---|---|
| This session continues straight into the edits and nobody asked for a plan | Inline: at most 20 lines in the current message — ordered steps, affected paths, each edge's reason, and the final verification. |
| A read-only planning mode, a requested plan, or another executor | Deliverable: `references/handoff-spec.md` alone defines the artifact's sections, their order, and each step's contents; write the artifact to the harness-designated plan file when one exists, otherwise `docs/plans/<topic>.md`. Prefer updating an existing plan for the same topic over creating a sibling, and extend a written plan with edits rather than writing the file again, because a rewrite re-enters every checkpoint into the context. Then run `scripts/validate-plan.mjs <plan-file>` and repair every reported problem until it prints `PLAN_VALID:true`, in at most three rounds; a third failing round ends the turn with the remaining problems listed, because an unbounded repair loop spends the context the executor needs. Validation is an internal gate: never quote its output or mention the result in the reply; surface a problem only when repair fails. |

A deliverable plan is never message-only: a fresh session with zero context must be able to open the artifact and execute it without the conversation that produced it.

## References

| File | Read it when |
|---|---|
| `references/handoff-spec.md` | Before writing any plan deliverable — a planning-mode plan file, a requested plan, or a handoff document. Do not load for the inline row. |
| `references/example-handoff.md` | Once, before composing the first checkpoint of a deliverable plan; do not load for the inline row. |
| `../implementing-batch/references/data-migration.md` | After affected paths are known and before ordering, only when work changes a database schema, persisted-data or file format, backfill, destructive DDL, persisted-data deletion, or compatibility between concurrently deployed versions. In-memory types, cache rebuilds, and version-only dependency bumps do not qualify. |

## Judgment

- While a read-only planning mode is active, this skill owns the turn. The one exception is an architecture audit, which `deepen` owns while still writing the plan artifact this skill defines. `shaping` decides product and architecture, the frontend-design skill the executing session has loaded decides visual direction, `research` confirms external behavior, and each hands control back into the plan. The plan fixes that direction in `## Visual direction`, records that skill's name there as `Design skill: <name>`, and schedules the build moment as a DESIGN checkpoint; it never restates that skill's quality floor.
- A specialist's brief, audit, or selected direction is intermediate input — this skill compiles those decisions into the persisted artifact, and a specialist ending its own workflow never ends the planning turn.
- An unproven failure inside a planning turn makes reproduction and proof the plan's first phase; plan no fix past the proof point. Outside a planning turn, `debug` outranks planning until the cause is proven.
- The executor and dependency-edge count set depth; an explicitly requested depth outranks both.
- An explicit request for a plan outranks the upstream-order skip.
- Repository verification and documentation conventions outrank unspecified defaults here.
- A deliverable plan ends the turn: the reply names the plan path, the checkpoint count, and the open questions, never the plan text, and execution starts under `implementing` in a fresh context.
- After a compaction notice, list the written checkpoints with `grep -n '^### ' <plan-file>` before adding another; the file, not memory, records what the plan already holds.
