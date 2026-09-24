---
name: deepen
description: "Use when the user asks where or how to improve architecture without naming one change: tech debt, coupling, shallow modules, refactor candidates, also in a read-only planning mode. Not for a single named refactor or rename, failing existing behavior, or a security or dependency audit."
argument-hint: "[path, module or pain point]"
---

# Deepen

Find the refactors that give a module a small interface over a large body of work, ranked by evidence read in this session. The enemy is the audit by impression, with claims about files nobody opened. The overcorrection is a catalog of every improvement imaginable instead of the few that repay their migration cost.

## Scope, taken from the argument

- A named target (a path, module, subsystem, layer or described pain) is matched to real paths, and the audit stays inside them.
- With no target, the `exo:explorer` agent names where commit history keeps coming back, and its ranges are the scope. Widen to the whole tree only when changes scatter without a cluster or the user asks for a full audit, still through explorer ranges, because reading the tree here fills the context before any card exists.
- The output opens with the scope, how it was picked and what was left out on purpose; the user is never asked to pick one.

## Terms

Use these words and no substitute such as component, service, unit, API, boundary, layer or wrapper:

| Term | Meaning |
|---|---|
| **Module** | Anything with an **interface**, what a caller must know, and an **implementation**, what it hides. |
| **Deep** or **shallow** | Deep when the interface is much smaller than what it hides; shallow when learning it teaches most of the implementation. |
| **Seam** | Where one implementation can stand in for another, each an **adapter**; one adapter is speculative, a second earns the seam. |
| **Locality** | What belongs together sits together, so a defect has one place to be. |
| **Leverage** | Many call sites share one interface, so improving it helps every caller. |
| **Deletion test** | Before calling a module shallow, imagine inlining it: complexity that gathers in one place means shallow; complexity that only spreads means not. |

## The audit

1. Read the scoped code and its callers in the ranges the `exo:explorer` agent names, with an offset and a limit, never a whole file over 100 lines. Record friction, not rule breaks, such as:
   - one idea followed only by jumping through a chain of tiny files;
   - a signature that asks callers to know nearly everything the module does;
   - small pure helpers that are easy to test, while the defects live in the code wiring them together;
   - modules reaching into each other's internals across a seam;
   - behavior with no tests, or none possible through its present interface.
2. Every finding names files and symbols opened in this session; nothing is claimed about code not read. State the deletion test's outcome before calling any module shallow.
3. Give each candidate a card with an id `C1`, `C2` in presentation order, so a reply can point at one: **Files**; **Friction** (one sentence); **Refactor** (the change and the interface it leaves); **Payoff** (locality and leverage gained, which tests stay and which move); **Confidence** (Firm, Plausible or Speculative).
4. Order the cards and end with the card to take first and why it goes first.

Fill every field the code settles; what it cannot settle becomes a stated assumption or a question before the plan, never an empty field or a menu of findings to pick from. Ask at most one question, only when a choice changes persisted data, a public protocol or signature, a paid provider, or an irreversible deletion or migration, with a recommendation.

## Two modes

| Mode | Output |
|---|---|
| A read-only planning mode is active, or the user asks for the plan | In this one invocation, audit, then write the plan for the top findings per the References row into the harness's plan file, else `docs/plans/<topic>.md`. Write the ranked cards into its `## Context` before loading that row, so a compaction loses no finding. End on `node "${CLAUDE_SKILL_DIR}/../using-exo/scripts/next-stage.mjs" --after deepen --artifact <plan path>`'s output. |
| Otherwise | The ranked cards in this message, each with what implementing it takes; no production edits and no file unless asked. End on `node "${CLAUDE_SKILL_DIR}/../using-exo/scripts/next-stage.mjs" --after deepen --artifact <top card's id>`'s output. |

## References

| File | Read it when |
|---|---|
| `../planning/references/plan-spec.md` | Before writing the plan deliverable — a planning-mode turn or an explicitly requested plan; that file alone defines the artifact's sections, order, and step contents. Do not load in report mode. |
| `../implementing-batch/references/test-design.md` | In plan mode, before writing the first task, to decide which tasks are risky and therefore write their test first. Do not load in report mode. |
| `../using-exo/references/question.md` | Before a message that asks the user to pick among numbered options, other than the next-stage question the script prints. |

## Judgment

- While a read-only planning mode is active and the request is an architecture audit, this skill owns the turn and writes the plan artifact `planning` defines; every other planning turn belongs to `planning`.
- Failing existing behavior outranks this skill: an unproven failure routes to `debug`, and a finding that explains a live symptom is a `debug` hypothesis, not an audit card.
- A single named refactor or rename is a decided change for `implementing-batch`.
- Every card states its migration cost, including a deepening that invalidates the whole test suite.
- After a compaction notice, treat unread code as unread and ask the `exo:explorer` agent for its ranges again before asserting anything, because a card may only name code opened this session.
