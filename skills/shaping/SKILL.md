---
name: shaping
description: "Turn an outcome or feature request without a chosen solution into explored options or a decided brief in docs/specs before code. Use when the user asks to build or add a capability, or to compare options or trade-offs. When a new visual surface does not name its displayed data, settings, or behavior, shaping decides those first; designing follows for presentation. Not for a named exact change, failing behavior, visual-only work, edits reaching at most two files, version bumps, git operations, or read-only questions. A bare \"fix this\" routes by its referent: working-tree diff, then latest failing check, then last-touched file."
---

# Shaping

Turn an outcome into a recommendation or a buildable brief before implementation. The enemy is coding through an unstated product or architecture decision. The overcorrection is interviewing every ambiguity before doing any work. Resolve defaults, ask at most one gated question, and keep moving.

## Size gate

Count these facts: more than two files; a new dependency; a changed public signature; a crossed persisted format or security boundary; required code not inspected during initial orientation. Zero means make the exact requested edits, prove them, and stop with no skill. One or more means use one mode below. Establish the facts through a `general-purpose` delegate from `../research/scout-prompt.md` when the request names no path, and read here only the ranges it returns, because search output kept here outlives the brief.

## Two modes

**Explore.** Use only when the user asks for options or a comparison. Give directions that differ on at least one named architecture, data, dependency, or interaction choice. State the trade-off and recommend one. Produce no file or brief.

**Specify.** Use when the user wants the outcome built. State the brief in the current message:

- **Goal:** one sentence describing the observable result.
- **Decisions I made:** each unresolved call plus one line of reasoning.
- **Acceptance:** observable checks.
- **Visual direction:** for a new visual surface only: whether the existing identity stays or may be replaced, the ambition, and who chooses between rendered directions; when the frontend-design skill returns, the path of its `contract-selected.json` with the contract's `title` and `description`.

Always write the brief to `docs/specs/<topic>.md` and name that path in the same message; the file, not the message, is the artifact a later session resumes from. One exception: when a planning turn borrowed this skill, fold the brief into the plan artifact instead of a separate spec file — the plan is the persisted document.

Both modes add three decisions:

- **Owning layer.** Name the existing layer and dependency boundary that own the behavior; cite one current caller, data owner, or repository convention that places it there.
- **Smaller alternative.** Name any alternative that removes the requested feature while changing fewer files and adding no dependency. If none exists, say nothing.
- **Stated assumptions.** Record defaults and continue; do not turn defaults into gates.

## Question gate

Resolve “this” from the first source containing a candidate: working-tree diff, most recent failing check, then last touched file. Use it when that source identifies exactly one path or symbol. Ask only when the first non-empty source identifies two or more candidates and the request names no path, symbol, or failure that distinguishes them. Take the diff as `git diff --stat` and the failing check as its last 40 lines, because the referent is a path and the full content belongs to the step that edits it.

Ask at most one implementation question, with a recommendation, only when all three facts are true:

1. neither the request nor repository conventions select an option;
2. at least two options remain after inspecting the relevant code;
3. choosing one changes persisted-data format, a public protocol or signature, a paid external provider, or an irreversible deletion/migration.

State the recommendation as the current default and continue in the same message. Only the unresolved-referent case above stops for an answer. Every other open point becomes a stated assumption.

## References

| File | Read it when |
|---|---|
| `../research/scout-prompt.md` | Before a codebase discovery dispatch. |

## Judgment

- `debug` outranks this skill when existing behavior fails and the cause is unproven.
- The frontend-design skill the executing session has loaded owns visual decisions, then hands control back; this skill retains product, data, and architecture decisions.
- A brief whose `## Visual direction` names an existing `contract-selected.json` hands the frontend-design skill a decided direction; it resumes at Build and repeats no variant choice.
- Explicit user wording outranks mode selection and artifact defaults.
- A brief hands over through its file: after a compaction notice, re-read `docs/specs/<topic>.md` and continue from it, never from the conversation. Naming that path ends this skill's part, not the turn: with no gated question open the next stage starts in the same turn, because a turn that ends on an unanswered brief ships no code.
