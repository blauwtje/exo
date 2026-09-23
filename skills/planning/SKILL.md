---
name: planning
description: Use when a read-only planning mode is active, a plan is requested, another session runs the work, or edits have two or more order dependencies. Not for same-session work with at most one dependency, one-file edits, git-only work, an unproven failure outside planning mode, or an architecture audit.
argument-hint: <what to plan, a spec path, or an issue number>
---

# Planning

Turn a request into a plan another mind can execute without interpretation. The enemy is the plan that restates intent and exports discovery to the executor. The overcorrection is a full edit specification for two edits the current session can order in two lines.

## Activation gate

Draw `A → B` when B cannot build, test, or preserve data before A lands. Zero or one edge for this session belongs in `implementing-batch`. When this session executes, nobody asked for a plan, and an upstream `shaping` brief lists every edge and places A before B for each one, use that order without running this skill.

## Intake

- Restate the actual goal in one sentence; plan against that restatement, not the prompt's phrasing.
- Resolve a vague referent from the first non-empty source: working-tree diff, most recent failing check, then last touched file.
- Separate hard requirements from incidental wording; record what the plan will not do as explicit non-goals.
- Decide every choice the user would not notice and record it in the plan; do not interview.
- Read an issue reference, `#<n>` or an issue URL, with `gh issue view <n> --json number,title,body,url`: a body whose first line is `<!-- exo:spec -->` is a shaped brief, planned as a spec file would be and never shaped again, and the plan's `## Goal` names `#<n>` so the finished pull request closes it.
- Ask, before writing, only what blocks planning: the first non-empty source holds two or more candidate referents and the request names no discriminator, or a choice changes persisted data, a public protocol or signature, a paid provider, or an irreversible deletion or migration. Attach a recommendation. The written plan carries no open question.

An outcome with no chosen solution borrows `shaping` for its product and architecture decisions; the resulting brief folds into the plan's Context rather than a separate file.

## Investigate

Run `node "${CLAUDE_SKILL_DIR}/scripts/repo-map.mjs"` before any dispatch and read the file at the path it prints: tracked paths with the exported names of their JavaScript and TypeScript files. It writes only under the git directory, so a read-only planning mode runs it too; outside a git repository it prints one `no map` line and discovery starts at the dispatch.

Delegate only what the map leaves open, the files, symbols, and call sites the plan will name, to the `exo:explorer` agent; a path the map names is never asked of it. Confirm each here by reading only the range around it: a session that greps the tree or opens whole files carries that output into every later turn. A name not read this session may not appear in a step. For a deliverable plan, write each step's code in full while the file is open: the executor pastes it. While a read-only planning mode is active, run only commands that leave the working tree unchanged; when proof requires an edit, make it the plan's first step.

Discovery is the only work this skill delegates. This session chooses the design, orders the tasks, and writes the artifact: a delegated design comes back whole and names files this session never read. A delegated context may critique a finished ordering, never author one.

A task whose path crosses a security boundary carries that reference's checks as its own steps, each with `Run:` and `Expected:`, never as a warning in `## Context`: the executor runs steps and reads past notes. A risky task gets its `Risk:` line and failing-test step (`references/plan-spec.md` rule 3) now, never left to the executor to notice.

Do not pre-run the plan: a context that applies every step and runs every `Run:` implements the change before the plan exists, and the executor implements it again. Each task's `Run:` and `Expected:` prove it where a failure is cheapest to fix, and `## Plan basis` names every command this session could not run.

## Depth

| Executor | Output |
|---|---|
| This session continues straight into the edits and nobody asked for a plan | Inline: at most 20 lines in the current message with ordered steps, affected paths, each edge's reason, and the final verification. |
| A read-only planning mode, a requested plan, or another executor | Deliverable: the artifact `references/plan-spec.md` defines, written to the harness-designated plan file when one exists, otherwise `docs/plans/<topic>.md`. |

A deliverable plan is never message-only: a fresh session with zero context must be able to open the artifact and execute it. Update an existing plan for the same topic rather than creating a sibling, and extend it with edits rather than rewriting the file, because a rewrite re-enters every task into the context.

Before ending the turn, read the plan once against the rules in `references/plan-spec.md` and against the brief's acceptance list: a step without code, a step without `Run:` and `Expected:`, a task without its `Commit:` block, a placeholder, or an acceptance check that reaches no step, no `## Final verification` line and no non-goal is repaired now, because the executor cannot.

## Handing it over

A deliverable plan ends the turn on the next-stage question: the reply names the plan path and the task count, never the plan text, then that question's numbered lines, with `/exo:implementing` on the recommended line.

## References

| File | Read it when |
|---|---|
| `references/plan-spec.md` | Before writing a deliverable plan; never for the inline row. |
| `references/example-plan.md` | Once, before the first task of a deliverable plan. |
| `../implementing-batch/references/data-migration.md` | After affected paths are known and before ordering, only when work changes a database schema, persisted-data or file format, backfill, destructive DDL, persisted-data deletion, or compatibility between concurrently deployed versions. In-memory types, cache rebuilds, and version-only dependency bumps do not qualify. |
| `../implementing-batch/references/test-design.md` | Before composing the first task, to decide which tasks are risky and therefore write their test first. |
| `../implementing-batch/references/security.md` | After affected paths are known and before ordering, only when changed behavior crosses authentication/authorization; tenant/resource ownership; secrets/credentials; untrusted input; network, file, or process execution; cryptography; or payments/regulated-data boundaries. Filenames and dependency names alone do not qualify. |
| `../using-exo/references/next-stage.md` | At the final message, when the work leaves a next stage open. |
| `../using-exo/references/question.md` | Before a message that asks the user to pick among numbered options. |

## Judgment

- While a read-only planning mode is active, this skill owns the turn. The one exception is an architecture audit, which `deepen` owns while still writing the plan artifact this skill defines. `shaping` decides product and architecture, the frontend-design skill the executing session has loaded decides visual direction, `research` confirms external behavior, and each hands control back into the plan. Here that skill is `designing`: `## Visual direction` records `Design skill: designing`, a task with a `Design:` line schedules the build, and the plan never restates that skill's quality floor.
- A specialist's brief, audit, or selected direction is intermediate input: this skill compiles those decisions into the persisted artifact, and a specialist ending its own workflow never ends the planning turn.
- An unproven failure inside a planning turn makes reproduction and proof the plan's first phase; plan no fix past the proof point. Outside a planning turn, `debug` outranks planning until the cause is proven.
- The executor and edge count set depth; a requested depth outranks both, and a requested plan outranks the upstream-order skip.
- Repository verification and documentation conventions outrank unspecified defaults.
- After a compaction notice, list the written tasks with `grep -n '^### Task [0-9]' <plan-file>` before adding another; the file, not memory, records what the plan already holds.
