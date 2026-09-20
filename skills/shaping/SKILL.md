---
name: shaping
description: "Use when a request names a result but leaves a product decision open: what counts as done, what data it holds, which architecture carries it, or a trade-off. When a new visual surface does not name its displayed data, settings, or behavior, shaping decides those first; designing follows for presentation. Not for a clear goal, a named change, a failure, visual-only work, or a two-file edit."
argument-hint: <outcome to shape>
---

# Shaping

Turn an outcome into a recommendation or a buildable brief before implementation. The enemy is coding through an unstated product or architecture decision. The overcorrection is interviewing every ambiguity before doing any work. Decide the routine choices, ask each decision the user would notice within a small budget, and keep moving.

## Decision gate

Count the product decisions the request leaves open: what counts as done; which data the outcome stores or shows; which of two or more architectures, dependencies, or owning layers carries it; what happens in a case the request does not mention. A decision is open only while the request, the repository's own conventions, and the ranges read this turn all fail to settle it; a decision this skill would make the obvious way is already closed. Zero open decisions means leave this skill and write no brief: a clear goal goes to `planning` when another session or executor runs it, and to `implementing-batch` when it builds here. Size is not the gate, because a three-file change with one obvious shape needs no brief and a one-file change resting on an unmade data decision does. One or more open decisions means use one mode below. Establish the facts through the `exo:explorer` agent when the request names no path, and read here only the ranges it returns, because search output kept here outlives the brief.

## Two modes

**Explore.** Use only when the user asks for options or a comparison. Give directions that differ on at least one named architecture, data, dependency, or interaction choice. State the trade-off and put the direction you recommend first. Produce no file or brief.

**Specify.** Use when the user wants the outcome built. State the brief in the current message:

- **Goal:** one sentence describing the observable result.
- **Decisions I made:** each unresolved call plus one line of reasoning.
- **Acceptance:** observable checks.
- **Visual direction:** for a new visual surface only: whether the existing identity stays or may be replaced, the ambition, and who chooses between rendered directions; when the frontend-design skill returns, the path of its `contract-selected.json` with the contract's `title` and `description`.

Store the brief where `specs` in the session's `exo settings:` line says, `docs` when that line is absent, and name its location in the same message; the stored brief, not the message, is the artifact a later session resumes from. That holds even when the next stage runs in this session, because a brief living only in a message dies at the next context clear and the stage after it then starts from nothing. `docs` writes `docs/specs/<topic>.md` in this skill's own section names. `issues` creates one GitHub issue whose body opens with the line `<!-- exo:spec -->` followed by the brief in the Spec shape of `../issuing/references/fields.md`, the goal as `### Outcome`, the acceptance checks as `### Done when` and the decisions as `### Decided`, with its fields and relations set as that file says, and writes no file; the setting is the authorization, so no draft is shown first, and for that same reason this path creates no label, milestone or project field and names in its message every field it therefore left unset. `both` writes the file, then that issue with the file's path under its references, and the file is the source when the two differ. `issues` and `both` write the file alone when `git remote get-url origin` names no GitHub repository or `gh auth status` fails, and the message says so in one line. One exception: when a planning turn borrowed this skill, fold the brief into the plan artifact instead of storing it — the plan is the persisted document. The message around that location carries the goal and the location, with each decision's reasoning left in the stored brief, and ends on the next-stage question in `using-exo` offering `/exo:planning docs/specs/<topic>.md`, or `/exo:planning #<n>` when an issue holds the brief.

Both modes add three decisions:

- **Owning layer.** Name the existing layer and dependency boundary that own the behavior; cite one current caller, data owner, or repository convention that places it there.
- **Smaller alternative.** Name any alternative that removes the requested feature while changing fewer files and adding no dependency. If none exists, say nothing.
- **Stated assumptions.** Record defaults and continue; do not turn defaults into gates.

## Question gate

Resolve “this” from the first source containing a candidate: working-tree diff, most recent failing check, then last touched file. Use it when that source identifies exactly one path or symbol. Ask only when the first non-empty source identifies two or more candidates and the request names no path, symbol, or failure that distinguishes them. Take the diff as `git diff --stat` and the failing check as its last 40 lines, because the referent is a path and the full content belongs to the step that edits it.

Sort each open decision by one test: would the user notice the other answer in the finished result without reading the code?

- **Noticeable, so asked:** what is in and out of scope, what counts as done, what happens in a case the request does not mention, and what the user sees or reads.
- **Costly, so asked:** a choice that changes persisted-data format, a public protocol or signature, a paid external provider, or an irreversible deletion/migration.
- **Routine, so decided:** names, file placement, internal structure, a dependency the manifest already lists, and any choice with one conventional answer.

Inspect the relevant code before asking, because a question the repository answers is not asked. Ask one question per message in the shape `## A question` in `using-exo` gives, the recommended answer as option 1, and name the decision inside the question. Every question's last option is **Go**: each decision still open takes its recommended answer.

Choose each question from the answers so far, never from a list fixed at the start. Ask first the decision whose answer can close others; an answer may open a follow-up on a noticeable decision, and a decision an answer already settled is never asked. Size the budget to the request: about 2 questions for a small change, about 5 for a feature, and at most 8 for a large or unclear request, never more. Open every question with its place, such as `Question 3 of about 5`, and correct the estimate when an answer changes it, because a user who cannot see the end stops answering with care.

Stop asking when no noticeable or costly decision is open, when the budget is spent, or when the user says go in any words. Write the brief after the last answer, because a brief written earlier is rewritten by the next one. Every routine decision, and every decision go or the budget closed, is listed under **Decisions I made** with its recommended answer, as an assumption the user can overturn.

## References

| File | Read it when |
|---|---|
| `../issuing/references/fields.md` | Before creating the issue, when `specs` is `issues` or `both` and the fallback does not apply. |

## Judgment

- `debug` outranks this skill when existing behavior fails and the cause is unproven.
- A closed decision outranks a brief: with nothing open, `planning` owns the turn when another session runs the work and `implementing-batch` owns it when the work builds here, and this skill leaves without writing a file.
- The frontend-design skill the executing session has loaded owns visual decisions, then hands control back; this skill retains product, data, and architecture decisions.
- A brief whose `## Visual direction` names an existing `contract-selected.json` hands the frontend-design skill a decided direction; it resumes at Build and repeats no variant choice.
- Explicit user wording outranks mode selection and artifact defaults.
- A brief hands over through its stored copy: after a compaction notice, re-read `docs/specs/<topic>.md` or `gh issue view <n> --json body` and continue from it, never from the conversation. Naming that location ends this skill's part on the next-stage question, and planning starts only on the user's pick.
