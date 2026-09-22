---
name: shaping
description: "Use when a request, or new wishes for an existing brief, issue or plan, leaves a product decision open: what counts as done, data, architecture, or a trade-off. When a new visual surface does not name its displayed data, settings, or behavior, shaping decides those first; designing follows for presentation. Not for a clear goal, a named change, a failure, visual-only work, or a two-file edit."
argument-hint: <outcome to shape>
---

# Shaping

Turn an outcome into a recommendation or a buildable brief before implementation. The enemy is coding through an unstated product or architecture decision. The overcorrection is interviewing every ambiguity before doing any work. Decide the routine choices, ask each decision the user would notice until none is open, and keep moving.

## Decision gate

Count the product decisions the request leaves open: what counts as done; which data the outcome stores or shows; which of two or more architectures, dependencies, or owning layers carries it; what happens in a case the request does not mention. A decision is open only while the request, the repository's own conventions, and the ranges read this turn all fail to settle it; a decision this skill would make the obvious way is already closed. Zero open decisions means leave this skill and write no brief: a clear goal goes to `planning` when another session or executor runs it, and to `implementing-batch` when it builds here. A request for a spec or a brief opens no decision, so it still gets no brief: the reply says nothing is open and names that stage by its skill name, and it ends on no question, because `## The next stage` follows a brief and none was written; a menu of Plan, Build and Stop is that question. Size is not the gate, because a three-file change with one obvious shape needs no brief and a one-file change resting on an unmade data decision does. One or more open decisions means use one mode below. Establish the facts through the `exo:explorer` agent when the request names no path, and read here only the ranges it returns, because search output kept here outlives the brief.

## Two modes

**Explore.** Use only when the user asks for options or a comparison. Give directions that differ on at least one named architecture, data, dependency, or interaction choice. State the trade-off and put the direction you recommend first. Produce no file or brief.

**Specify.** Use when the user wants the outcome built. It runs three phases in order: `## Grill` asks until the map is empty, `## Checkpoint` confirms every decision, and `## Spec` writes the brief.

Both modes add four decisions:

- **Owning layer.** Name the existing layer and dependency boundary that own the behavior; cite one current caller, data owner, or repository convention that places it there.
- **Smaller alternative.** Name any alternative that removes the requested feature while changing fewer files and adding no dependency. If none exists, say nothing.
- **Stated assumptions.** Record defaults and continue; do not turn defaults into gates.
- **Settled words.** When the repository keeps a file of its domain words, write with those words and correct a replaced one in the reply; a word this turn settles is recorded as a decision, beside the word it replaces.

## Question gate

Resolve “this” from the first source containing a candidate: working-tree diff, most recent failing check, then last touched file. Use it when that source identifies exactly one path or symbol. Ask only when the first non-empty source identifies two or more candidates and the request names no path, symbol, or failure that distinguishes them. Take the diff as `git diff --stat` and the failing check as its last 40 lines, because the referent is a path and the full content belongs to the step that edits it.

Sort each open decision by one test: would the user notice the other answer in the finished result without reading the code?

- **Noticeable, so asked:** what is in and out of scope, what counts as done, what happens in a case the request does not mention, and what the user sees or reads.
- **Costly, so asked:** a choice that changes persisted-data format, a public protocol or signature, a paid external provider, or an irreversible deletion/migration.
- **Routine, so decided:** names, file placement, internal structure, a dependency the manifest already lists, and any choice with one conventional answer. That includes a detail of an output the request already shapes, such as value types, layout or two conflicting flags, and a choice the code already makes one way; putting one in a round is still asking it.

## Grill

The map sets how long the interview runs: no budget ends it and no guess closes a decision.

1. **Map what is asked.** Put every noticeable or costly decision on the map, one line each, in the user's words. Beside it goes the decision it waits on, because its options change with that answer; a decision is ready once every decision above it is closed.
2. **Close what the repository answers.** Inspect the relevant code before asking. A decision it settles is closed by the code, with the path as evidence, and is never asked. A decision the user names as undecided stays open whatever the code suggests, because the code shows one earlier choice, not their answer. A fact is exo's to find, never the user's: look it up, holding back only the question that needs it.
3. **Ask in rounds.** One round asks every ready decision, at most four, in the layout `## A round` gives. With more than four ready, ask the four that unblock the most others. A decision that waits on one in the same round moves to the next round, because its options are unknown until that answer.
4. **Count, never budget.** Every round opens with its number and how many decisions are still open. Question numbers run on across rounds, so the user can point back at Q2 from round 3. After the answers, one line per question says what it closed and what it opened, then the next round follows in the same message, because a user who cannot see the end stops answering with care.
5. **End on an empty map, or on Go.** `go` takes the recommended answer for every decision still open, asked or not, and moves to `## Checkpoint`.
6. **Name who closed it.** Every closed decision records you, the code with its path, or exo for a routine one or a Go.

## A round

The reader has not seen the code, so every part is written for that reader, in this order:

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

- The options follow `## A question` in `using-exo`, and the question names the decision.
- A path or an identifier appears only beside what it means, because the reader answers from the product, never from the code.
- Any answer counts: `ok` takes every recommended answer of the round, a round of one question takes a bare digit, and a reply in words is read as the decisions it names. A question the reply skips stays open for the next round, and one that fits two options is asked again.
- "I don't know" gets the difference in two sentences with one example from the user's own product, and that question returns in the next round. A second one takes the recommended answer, listed as exo's.
- With `interview=page` in the `exo settings:` line and two or more open decisions, the round goes to the browser page under `references/interview-page.md`, and the conversation carries only what each answer closed and opened.

## Checkpoint

With the map empty, list every decision on one line, `Q<n> · <decision>: <answer> (<you | code: path | exo>)`, the code's decisions without a number. Then ask one question in the shape `## A question` gives:

1. **Write the spec (Recommended)**: exo writes the brief from these decisions.
2. **Change something**: the questions you name return as the next round.

Nothing is written before the answer, because a brief written earlier is rewritten by the next one. A reply that names a question reopens it, as option 2 does.

## Spec

Write the brief and ask nothing more: a decision that surfaces while it is written takes its recommended answer and is listed as exo's. It holds these sections, in this order:

- **Goal:** one sentence describing the observable result.
- **Problem:** what goes wrong for the user today, seen from their side, in one or two sentences.
- **Decisions:** every decision with its answer and who closed it: you, the code with the path that settles it, or exo for a routine one.
- **Out of scope:** what a reader would otherwise assume is included.
- **Acceptance:** observable checks.
- **Proof:** the highest seam that can run the acceptance checks, the one closest to what the user does, and which checks it runs there.
- **Visual direction:** for a new visual surface only: whether the existing identity stays or may be replaced, the ambition, and who chooses between rendered directions; when the frontend-design skill returns, the path of its `contract-selected.json` with the contract's `title` and `description`.

Store the brief where `specs` in the session's `exo settings:` line says, `docs` when that line is absent, and name its location in the same message; the stored brief, not the message, is the artifact a later session resumes from. That holds even when the next stage runs in this session, because a brief living only in a message dies at the next context clear and the stage after it then starts from nothing. `docs` writes `docs/specs/<topic>.md` in this skill's own section names. `issues` creates one GitHub issue whose body opens with the line `<!-- exo:spec -->` followed by the brief in the Spec shape of `../issuing/references/fields.md`, with its sections, fields and relations as that file says and none of them decided here, and writes no file; the setting is the authorization, so no draft is shown first, and for that same reason this path creates no label, type or milestone the repository does not already define, sets every field it does define, and names in its message each field left unset. `both` writes the file, then that issue with the file's path under its references, and the file is the source when the two differ. `issues` and `both` write the file alone when `git remote get-url origin` names no GitHub repository or `gh auth status` fails, and the message says so in one line. One exception: when a planning turn borrowed this skill, fold the brief into the plan artifact instead of storing it — the plan is the persisted document. The message around that location carries the goal and the location, with each decision's reasoning left in the stored brief, and ends on the next-stage question in `using-exo` offering `/exo:planning docs/specs/<topic>.md`, or `/exo:planning #<n>` when an issue holds the brief.

## A stored brief

New wishes for work that already has a brief reopen that brief, because a second brief for one outcome disagrees with the first by the next edit.

1. **Find it** in the first source that names one: a `#<n>`, URL or path in the request; the branch's handoff; an open issue whose body opens `<!-- exo:spec -->`; a file under `docs/specs/` or `docs/plans/` whose title names the same outcome. `gh issue list --state open --limit 200 --json number,title,body --jq '.[] | select(.body | startswith("<!-- exo:spec -->")) | "\(.number)\t\(.title)"'` lists those issues.
2. **One match is the brief**, named in one line above the first question. Two or more is one question naming them, a new brief last. None is a new brief.
3. **Load its decisions as closed**, each with its source. Only a decision the new wishes contradict or leave unanswered goes on the map.
4. **Edit in place.** A file is edited where it stands. An issue whose body opens `<!-- exo:spec -->` is rewritten with `gh issue edit <n> --body-file <file>`, keeping that first line and its sections, because the issue's edit history keeps the earlier body. Any other issue was written by a person: leave its body alone and name it under the new brief's references.
5. **A plan follows its brief.** When a plan names the brief, the next-stage question offers `/exo:planning` on that plan, which updates it in place.

## References

| File | Read it when |
|---|---|
| `../issuing/references/fields.md` | Before creating the issue, when `specs` is `issues` or `both` and the fallback does not apply. |
| `references/interview-page.md` | Before the first question, only when `interview=page` stands in the `exo settings:` line and the map holds two or more open decisions. |

## Judgment

- `debug` outranks this skill when existing behavior fails and the cause is unproven.
- A closed decision outranks a brief: with nothing open, `planning` owns the turn when another session runs the work and `implementing-batch` owns it when the work builds here, and this skill leaves without writing a file.
- The frontend-design skill the executing session has loaded owns visual decisions, then hands control back; this skill retains product, data, and architecture decisions.
- A brief whose `## Visual direction` names an existing `contract-selected.json` hands the frontend-design skill a decided direction; it resumes at Build and repeats no variant choice.
- Explicit user wording outranks mode selection and artifact defaults.
- An empty map outranks a longer interview: a question is asked only while a noticeable or costly decision is open.
- A stored brief outranks a new one while both name the same outcome.
- A brief hands over through its stored copy: after a compaction notice, re-read `docs/specs/<topic>.md` or `gh issue view <n> --json body` and continue from it, never from the conversation. Naming that location ends this skill's part on the next-stage question, and planning starts only on the user's pick.
