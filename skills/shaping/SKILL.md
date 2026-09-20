---
name: shaping
description: "Use when a request, or new wishes for an existing brief, issue or plan, leaves a product decision open: what counts as done, data, architecture, or a trade-off. When a new visual surface does not name its displayed data, settings, or behavior, shaping decides those first; designing follows for presentation. Not for a clear goal, a named change, a failure, visual-only work, or a two-file edit."
argument-hint: <outcome to shape>
---

# Shaping

Turn an outcome into a recommendation or a buildable brief before implementation. The enemy is coding through an unstated product or architecture decision. The overcorrection is interviewing every ambiguity before doing any work. Decide the routine choices, ask each decision the user would notice until none is open, and keep moving.

## Decision gate

Count the product decisions the request leaves open: what counts as done; which data the outcome stores or shows; which of two or more architectures, dependencies, or owning layers carries it; what happens in a case the request does not mention. A decision is open only while the request, the repository's own conventions, and the ranges read this turn all fail to settle it; a decision this skill would make the obvious way is already closed. Zero open decisions means leave this skill and write no brief: a clear goal goes to `planning` when another session or executor runs it, and to `implementing-batch` when it builds here. Size is not the gate, because a three-file change with one obvious shape needs no brief and a one-file change resting on an unmade data decision does. One or more open decisions means use one mode below. Establish the facts through the `exo:explorer` agent when the request names no path, and read here only the ranges it returns, because search output kept here outlives the brief.

## Two modes

**Explore.** Use only when the user asks for options or a comparison. Give directions that differ on at least one named architecture, data, dependency, or interaction choice. State the trade-off and put the direction you recommend first. Produce no file or brief.

**Specify.** Use when the user wants the outcome built. State the brief in the current message:

- **Goal:** one sentence describing the observable result.
- **Decisions:** every decision with its answer and who closed it: you, the code with the path that settles it, or exo for a routine one.
- **Acceptance:** observable checks.
- **Visual direction:** for a new visual surface only: whether the existing identity stays or may be replaced, the ambition, and who chooses between rendered directions; when the frontend-design skill returns, the path of its `contract-selected.json` with the contract's `title` and `description`.

Store the brief where `specs` in the session's `exo settings:` line says, `docs` when that line is absent, and name its location in the same message; the stored brief, not the message, is the artifact a later session resumes from. That holds even when the next stage runs in this session, because a brief living only in a message dies at the next context clear and the stage after it then starts from nothing. `docs` writes `docs/specs/<topic>.md` in this skill's own section names. `issues` creates one GitHub issue whose body opens with the line `<!-- exo:spec -->` followed by the brief in the Spec shape of `../issuing/references/fields.md`, with its sections, fields and relations as that file says and none of them decided here, and writes no file; the setting is the authorization, so no draft is shown first, and for that same reason this path creates no label, type or milestone the repository does not already define, sets every field it does define, and names in its message each field left unset. `both` writes the file, then that issue with the file's path under its references, and the file is the source when the two differ. `issues` and `both` write the file alone when `git remote get-url origin` names no GitHub repository or `gh auth status` fails, and the message says so in one line. One exception: when a planning turn borrowed this skill, fold the brief into the plan artifact instead of storing it — the plan is the persisted document. The message around that location carries the goal and the location, with each decision's reasoning left in the stored brief, and ends on the next-stage question in `using-exo` offering `/exo:planning docs/specs/<topic>.md`, or `/exo:planning #<n>` when an issue holds the brief.

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
- **Routine, so decided:** names, file placement, internal structure, a dependency the manifest already lists, and any choice with one conventional answer.

## The decision map

The map sets how long the interview runs: no budget ends it and no guess closes a decision.

1. **Map what is asked.** Put every noticeable or costly decision on the map, one line each, in the user's words. Beside it goes the open decision it waits on, because its options change with that answer.
2. **Close what the repository answers.** Inspect the relevant code before asking. A decision it settles is closed by the code, with the path as evidence, and is never asked.
3. **Show the map from three.** A map of three or more open decisions stands above the first question. A shorter one shows only its place line, because a map of two is noise.
4. **Ask what waits on nothing.** One decision per message, chosen from the answers so far: the one whose answer closes the most others.
5. **Count, never budget.** Open every question with its place, such as `Question 2, 3 still open`. After an answer, say in one line what it closed and what it opened, because a user who cannot see the end stops answering with care.
6. **End on an empty map, or on Go.** **Go** is every question's last option: each decision still open takes its recommended answer. Write the brief after the last answer, because a brief written earlier is rewritten by the next one.
7. **Name who closed it.** The interview writes nothing and the brief asks nothing. A decision that surfaces while the brief is written takes its recommended answer and is listed as exo's.

## One question

The reader has not seen the code, so every part is written for that reader, in this order:

```text
Question <n>, <k> still open
**<the decision as one question in everyday words?>**
<one line: what the user will see differ in the finished result>

1. **<Label> (Recommended)**: <what the user gets>
2. **<Label>**: <what the user gets>
3. **Go**: every open decision takes its recommended answer.
```

- The options follow `## A question` in `using-exo`, and the question names the decision.
- A path or an identifier appears only beside what it means, because the reader answers from the product, never from the code.
- Any answer counts: a reply in words is read as the decision it names, and is asked again only when it fits two options.
- "I don't know" gets the difference in two sentences with one example from the user's own product, then the same options once more. A second one takes the recommended answer, listed as exo's.
- With `interview=page` in the `exo settings:` line and two or more open decisions, the question goes to the browser page under `references/interview-page.md`, and the conversation carries only what each answer closed and opened.

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
