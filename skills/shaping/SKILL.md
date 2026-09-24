---
name: shaping
description: "Use when a request, or new wishes for a stored brief, issue or plan, leaves a product decision open: what counts as done, data, architecture or a trade-off. When a new visual surface does not name its displayed data, settings, or behavior, shaping decides those first; designing follows for presentation. Not for a clear goal, a failure, or visual-only work."
argument-hint: <outcome to shape>
---

# Shaping

Turn an outcome into a recommendation or a buildable brief before implementation. The enemy is coding through an unstated product or architecture decision. The overcorrection is interviewing every ambiguity before doing any work. Decide the routine choices, ask each decision the user would notice until none is open, and keep moving.

## Decision gate

Count the product decisions the request leaves open: what counts as done; which data the outcome stores or shows; which of two or more architectures, dependencies or owning layers carries it; what happens in a case the request does not mention. A decision stays open only while the request, repository conventions and this turn's ranges all fail to settle it. Zero open decisions, or a spec/brief request already resolved, means leave this skill and write no brief: a clear goal goes to `planning` when a session or executor runs it, `implementing-batch` when it builds here; either way the reply says nothing is open, names that stage by its skill name and ends on no question — a menu of Plan, Build and Stop counts as one. Size is not the gate: a three-file change with one obvious shape needs no brief and a one-file change resting on an unmade data decision does. Establish facts via `exo:explorer` when the request names no path, reading only the ranges it returns: kept search output outlives the brief.

New wishes for work that already has a brief, issue or plan reopen that brief: a second brief for one outcome disagrees with the first by the next edit.

## Two modes

**Explore**, only when the user asks for options or a comparison: directions differing on at least one named architecture, data, dependency or interaction choice, trade-offs stated, the recommended one first, no file or brief.

**Specify**, when the user wants the outcome built: `## Grill` asks until the map is empty, `## Checkpoint` confirms every decision, and `## Spec` writes the brief.

Both modes add three decisions:

- **Owning layer.** Name the existing layer and dependency boundary that own the behavior, citing one caller, data owner or convention that places it there; carry it through every place it touches, not bolted on. Two or more structural shapes open `references/architecture-sketch.md`.
- **Smaller alternative.** Name an alternative that drops the requested feature while changing fewer files and adding no dependency; say nothing when none exists.
- **Settled words.** When the repository keeps a file of its domain words, write with them and correct a replaced one in the reply; a word this turn settles is recorded as a decision beside the word it replaces.

## Question gate

Resolve “this” from the first source containing a candidate: working-tree diff, most recent failing check, then last touched file. Use it when that source names exactly one path or symbol; ask only when it names two or more and the request names no path, symbol or failure that tells them apart. Take the diff as `git diff --stat`, a failing check as its last 40 lines: the referent is a path, and its content belongs to the step that edits it.

Sort each open decision by one test: would the user notice the other answer in the finished result without reading the code?

- **Noticeable, so asked:** what is in and out of scope, what counts as done, what happens in a case the request does not mention, and what the user sees or reads.
- **Costly, so asked:** a choice that changes persisted-data format, a public protocol or signature, a paid external provider, or an irreversible deletion/migration.
- **Routine, so decided:** names, file placement, internal structure, a dependency the manifest lists, a choice with one conventional answer or one the code makes, and a detail of an output the request already shapes: value types, layout or two conflicting flags; putting one in a round is still asking it.

## Grill

The map sets how long the interview runs: no budget ends it and no guess closes a decision.

1. **Map what is asked.** Send every noticeable or costly decision to `--add`, one line each in the user's words (`references/decision-map.md`). Beside it goes the decision it waits on, since its options change with that answer; a decision is ready once every decision above it closes.
2. **Close what the repository answers.** Inspect the code before asking: a decision it settles is sent to `--add` already closed, path as evidence, never asked. A decision the user names undecided stays open whatever the code suggests: code shows one earlier choice, not their answer. A fact is exo's to look up, never the user's; hold back only the question that needs it.
3. **Ask in rounds.** A round asks every ready decision, at most four; with more ready, the four that unblock the most others. A decision waiting on one in the same round moves to the next, since its options are unknown until then. `--text` gives the layout `## A round` shows.
4. **Report each round.** Relay the `closed`/`opened` lines `--apply` and `--add` print, and the next round follows in the same message: a user who cannot see the end stops answering with care.
5. **End on an empty map, or on Go.** `go` (via `--apply`) takes the recommended answer for every decision still open, asked or not, and moves to `## Checkpoint`.
6. **Name who closed it.** Every closed decision records you, the code with its path, or exo for a routine one or a Go; `--add`/`--apply` set `closedBy`, never the session by hand.

## A round

The reader has not seen the code, so every part is written for that reader, in order:

```text
<above the first round only, from three open decisions, one line each:>
- <an open decision in the user's words>: <round 1 | waits on <that decision>>

Round <r> · <k> still open

**Q<n> · <the decision in two to four words>**
<the decision as one question in everyday words?>
Changes: <what the user will see differ in the finished result>

1. **<Label> (Recommended)**: <what the user gets>
2. **<Label>**: <what the user gets>

Why 1: <one clause>

---

**Q<n+1> · ...**

Answer like `4.1 5.2`, `ok` for every recommended answer, or `go` for the recommended answer to everything still open.
```

- Options follow the question shape; the question names the decision. Question numbers run on across rounds, so a reply can cite Q2 from round 3.
- A path or an identifier appears only beside what it means: the reader answers from the product, never from the code.
- Any answer counts: `ok` takes every recommended answer of the round, a round of one question takes a bare digit, and a worded reply is read as the decisions it names. A skipped question stays open for the next round; one whose answer fits two options is asked again. Fold it onto the map with `--apply`.
- "I don't know" gets the difference in two sentences with one example from the product, and the question returns next round; a second one takes the recommended answer, listed as exo's.

## Checkpoint

`--text` lists every decision on one line once the map is empty, `Q<n> · <decision>: <answer> (<you | code: path | exo>)`, the code's decisions without a number. Then ask one question in the question shape:

1. **Write the spec (Recommended)**: exo writes the brief from these decisions.
2. **Change something**: the questions you name return as the next round.

Nothing is written before the answer: an earlier brief is rewritten by the next one, and a reply naming a question reopens it.

## Spec

Write the brief in the sections `references/brief.md` gives and ask nothing more: a decision that surfaces while it is written takes its recommended answer, listed as exo's.

Store the brief where `specs` in the session's `exo settings:` line says, `docs` when absent, and name its location in the same message, even when the next stage runs here: a brief living only in a message dies at the next context clear. `docs` writes `docs/specs/<topic>.md`; `issues` and `both` follow `references/brief-in-an-issue.md`. A planning turn that borrowed this skill folds the brief into the plan artifact. The message carries the goal and location, leaves each decision's reasoning in the brief, and ends on `node "${CLAUDE_SKILL_DIR}/../using-exo/scripts/next-stage.mjs" --after shaping --artifact <brief path, or #<n> when an issue holds it>`'s output.

## References

| File | Read it when |
|---|---|
| `references/stored-brief.md` | Before mapping, when the request names a `#<n>`, URL or path, or brings new wishes for work that already has a brief. |
| `references/brief.md` | At `## Spec`, before the brief is written. |
| `references/brief-in-an-issue.md` | Before storing, when `specs` is `issues` or `both`. |
| `../issuing/references/fields.md` | Before creating the issue, when `specs` is `issues` or `both` and the fallback does not apply. |
| `references/decision-map.md` | Before the first round, in every mode: the run folder, map format and the `--add`/`--apply`/`--text` commands. |
| `references/architecture-sketch.md` | When an open decision names two or more structural shapes to weigh. |
| `references/interview-page.md` | Before the first question, only when `interview=page` is in the `exo settings:` line and the map holds two or more open decisions. |
| `../using-exo/references/question.md` | Before a message that asks the user to pick among numbered options, other than the next-stage question the script prints. |

## Judgment

- `debug` outranks this skill when existing behavior fails and the cause is unproven.
- The loaded frontend-design skill owns visual decisions, then hands control back; this skill retains product, data, and architecture decisions.
- Explicit user wording outranks mode selection and artifact defaults.
- A stored brief outranks a new one while both name the same outcome.
- A brief hands over through its stored copy: after a compaction notice, re-read `docs/specs/<topic>.md` or `gh issue view <n> --json body` and continue from it, never from the conversation; planning starts only on the user's pick.
