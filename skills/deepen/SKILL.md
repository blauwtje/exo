---
name: deepen
description: "Use when the user asks where or how to improve architecture without naming one exact change: tech debt, coupling, shallow modules, refactor candidates across a codebase or subsystem. In a read-only planning mode it owns the turn and writes the plan for its findings. Not for a single named refactor or rename, failing existing behavior, or a security or dependency audit."
---

# Deepen

Surface the refactors that turn shallow modules into deep ones, ranked by evidence from code read this session. The enemy is the vibes audit — findings asserted about files never opened. The overcorrection is the exhaustive rewrite catalog that reports every theoretical improvement instead of the few worth their migration cost.

## Scope — an argument, not an interview

- A named target — a path, module, subsystem, layer, or felt pain point — resolves against real paths; audit only inside it.
- Nothing named: ask a `general-purpose` delegate from `../research/scout-prompt.md` for the commit-history hot spots, the files and areas that keep recurring, and take the ranges it names as the scope. Widen to the whole tree only when changes are too scattered to yield a hot spot or the user asks for a whole-codebase audit, and still audit through scout-named ranges, because a whole-tree read here exhausts the context before the cards are written.
- Open the output by stating the resolved scope, how it was chosen, and what was deliberately left out. Never ask the user to pick a scope.

## Vocabulary

Use exactly these terms; do not substitute component, service, unit, API, boundary, layer, or wrapper.

- **Module** — any unit with an **interface** (what callers must know) and an **implementation** (what it hides).
- **Deep / shallow** — deep when the interface is far simpler than the implementation behind it; shallow when knowing the interface is nearly knowing the implementation.
- **Seam** — a point where an implementation can be swapped; an **adapter** realizes one. One adapter is a hypothetical seam; two adapters make it real.
- **Locality** — related behavior lives in one place, so bugs concentrate where they can be found.
- **Leverage** — one interface serving many call sites, so one improvement pays off at every caller.
- **Deletion test** — before calling a module shallow, ask: would deleting it and inlining its work concentrate complexity in one place, or merely move it? Only "concentrates" qualifies as shallow.

## The audit

1. Read the scoped code and its callers in the ranges a `general-purpose` delegate from `../research/scout-prompt.md` names, with an offset and a limit, never a whole file over 100 lines. Note friction, not rule violations:
   - understanding one concept requires bouncing between many small modules;
   - an interface nearly as complex as the implementation it fronts;
   - pure functions extracted for testability while the real bugs hide in how they are called;
   - tightly coupled modules leaking internals across a seam;
   - code that is untested or untestable through its current interface.
2. Every finding names files and symbols opened this session; assert nothing about code not read. Apply the deletion test explicitly before calling any module shallow.
3. Present each candidate as a card with an id `C1`, `C2` in the order presented, so a reply can name one: **Files**; **Problem** (one sentence of friction); **Solution** (the concrete refactor and the resulting interface); **Benefit** (locality and leverage gained, which tests survive and which move); **Strength** (Strong, Worth exploring, or Speculative).
4. Rank the cards and close with the top recommendation and why it goes first.

Fill in everything the code determines: affected files, the refactor, the resulting interface, surviving tests, ordering. Unknowables become stated assumptions, or a question asked before the plan is written — never placeholder fields, and never a menu of findings for the user to choose from. Ask at most one question, only when a choice changes persisted data, a public protocol or signature, a paid provider, or an irreversible deletion or migration; attach a recommendation.

## Two modes

| Mode | Output |
|---|---|
| A read-only planning mode is active, or the user asks for the plan | Audit, then write the executable plan for the top findings per the References row — into the harness-designated plan file when one exists, otherwise `docs/plans/<topic>.md`. One invocation delivers both; no second skill. Write the ranked cards into that file's `## Context` before loading the References row, so a compaction after the audit loses no finding. |
| Otherwise | Report only: the ranked cards in the current message, plus what implementing each would take. No production edits, and no artifact unless the user asks for a file. The ending is those cards and the one next action under the closing rule in `using-exo`, never the reasoning behind a rank. |

## References

| File | Read it when |
|---|---|
| `../planning/references/handoff-spec.md` | Before writing the plan deliverable — a planning-mode turn or an explicitly requested plan; that file alone defines the artifact's sections, order, and step contents. Do not load in report mode. |
| `../research/scout-prompt.md` | Before a codebase discovery dispatch, which runs on `sonnet`. |

## Judgment

- While a read-only planning mode is active and the request is an architecture audit, this skill owns the turn and writes the plan artifact `planning` defines; every other planning turn belongs to `planning`.
- Failing existing behavior outranks this skill: an unproven failure routes to `debug`, and a finding that explains a live symptom is a `debug` hypothesis, not an audit card.
- A single named refactor or rename is a decided change for `implementing-batch`; this skill exists for the open question of where and what to improve.
- Migration cost is part of every recommendation: a deepening that invalidates the whole test suite must say so in its card.
- Report mode ends the turn at the ranked cards and plan mode when the plan validates; after a compaction notice, treat unread code as unread and ask a `general-purpose` delegate from `../research/scout-prompt.md` for its ranges again before asserting anything, because a card may only name code opened this session.
