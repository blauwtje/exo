---
name: deepen
description: "Use when the user asks where or how to improve architecture without naming one exact change: tech debt, coupling, shallow modules, refactor candidates across a codebase or subsystem. In a read-only planning mode it owns the turn and writes the plan for its findings. Not for a single named refactor or rename, failing existing behavior, or a security or dependency audit."
argument-hint: "[path, module or pain point]"
---

# Deepen

Find the refactors that give a module a small interface over a large body of work, ranked by evidence read in this session. The enemy is the audit by impression, with claims about files nobody opened. The overcorrection is a catalog of every improvement imaginable instead of the few that repay their migration cost.

## Scope, taken from the argument

- A named target, whether a path, module, subsystem, layer or a pain the user describes, is matched to real paths, and the audit stays inside them.
- With no target, ask the `exo:explorer` agent where commit history keeps coming back, the files and areas changed again and again, and take the ranges it names as the scope. Widen to the whole tree only when the changes scatter too much to show a cluster or the user asks for a full audit, and even then read through ranges the explorer names, because reading the whole tree here fills the context before any card exists.
- The output opens with the scope, how it was picked and what was left out on purpose. The user is never asked to pick a scope.

## Terms

Use these words and no substitute such as component, service, unit, API, boundary, layer or wrapper:

| Term | Meaning |
|---|---|
| **Module** | Anything with an **interface**, what a caller has to know, and an **implementation**, what that interface hides. |
| **Deep** or **shallow** | Deep when the interface is much smaller than what it hides; shallow when learning the interface teaches most of the implementation. |
| **Seam** | A place where one implementation can stand in for another; each stand-in is an **adapter**. A seam with a single adapter is speculative, and a second adapter makes it earn its place. |
| **Locality** | Behavior that belongs together sits together, so a defect has one place to be. |
| **Leverage** | Many call sites share one interface, so improving it helps every caller at once. |
| **Deletion test** | Before calling a module shallow, imagine removing it and inlining its work: if the complexity gathers in one place, the module was shallow; if it only spreads elsewhere, it was not. |

## The audit

1. Read the scoped code and its callers in the ranges the `exo:explorer` agent names, with an offset and a limit, never a whole file longer than 100 lines. Record friction rather than rule breaks, for example:
   - one idea that can only be followed by jumping through a chain of tiny files;
   - a module whose signature asks callers to know nearly everything it does;
   - logic split into small pure helpers that are easy to test, while the defects live in the code that wires them together;
   - modules that reach into each other's internals across a seam;
   - behavior with no tests, or none possible through its present interface.
2. Every finding names files and symbols opened in this session, and nothing is claimed about code not read. State the deletion test's outcome before calling any module shallow.
3. Give each candidate a card with an id `C1`, `C2` in presentation order, so a reply can point at one: **Files**; **Friction** (one sentence); **Refactor** (the change and the interface it leaves); **Payoff** (locality and leverage gained, and which tests stay and which move); **Confidence** (Firm, Plausible, or Speculative).
4. Order the cards and end with the card to take first and the reason it goes first.

Fill in whatever the code settles: the files, the refactor, the resulting interface, the tests that survive, the order. What the code cannot settle becomes a stated assumption, or a question asked before the plan is written; never an empty field, and never a menu of findings for the user to pick from. Ask one question at most, and only when a choice changes persisted data, a public protocol or signature, a paid provider, or an irreversible deletion or migration; attach a recommendation.

## Two modes

| Mode | Output |
|---|---|
| A read-only planning mode is active, or the user asks for the plan | Audit, then write the executable plan for the top findings per the References row — into the harness-designated plan file when one exists, otherwise `docs/plans/<topic>.md`. One invocation delivers both; no second skill. Write the ranked cards into that file's `## Context` before loading the References row, so a compaction after the audit loses no finding. The turn ends on the next-stage question in `using-exo` with the command that runs the plan. |
| Otherwise | Report only: the ranked cards in the current message, plus what implementing each would take. No production edits, and no artifact unless the user asks for a file. The ending is those cards, then the next-stage question in `using-exo` offering `planning` for the top card, never the reasoning behind a rank. |

## References

| File | Read it when |
|---|---|
| `../planning/references/handoff-spec.md` | Before writing the plan deliverable — a planning-mode turn or an explicitly requested plan; that file alone defines the artifact's sections, order, and step contents. Do not load in report mode. |

## Judgment

- While a read-only planning mode is active and the request is an architecture audit, this skill owns the turn and writes the plan artifact `planning` defines; every other planning turn belongs to `planning`.
- Failing existing behavior outranks this skill: an unproven failure routes to `debug`, and a finding that explains a live symptom is a `debug` hypothesis, not an audit card.
- A single named refactor or rename is a decided change for `implementing-batch`; this skill exists for the open question of where and what to improve.
- Migration cost is part of every recommendation: a deepening that invalidates the whole test suite must say so in its card.
- Report mode ends the turn at the ranked cards and plan mode when the plan validates; after a compaction notice, treat unread code as unread and ask the `exo:explorer` agent for its ranges again before asserting anything, because a card may only name code opened this session.
