---
name: using-exo
description: Use when a session starts, after a clear and after a compaction, before any other action, to know how the exo skills are named, found and ordered. Not for a turn that already holds its rules in context.
---

# Using exo

Every exo skill is invoked as `exo:<name>`; a bare name in a skill, agent or rule body means that skill.

## Before acting

1. Match the request against the skill descriptions before the first tool call, including a clarifying question.
2. When one fires, invoke and follow it; when it turns out wrong, say so and leave it.
3. Use no skill for a version-only bump, a git-only operation or a read-only question no skill description claims.
4. Use no skill for an edit reaching at most two files that adds no dependency and changes no public signature, persisted format or security boundary, except a failure with an unproven cause, which `debug` owns, and a visual change, which `designing` owns.
5. Issue and pull-request workflows run only when the user invokes them: name `/exo:issuing` or `/exo:merge-prs` instead of doing that work by hand.

## When several fire

- `debug` outranks the rest until a failure's cause is proven.
- `shaping` decides what to build, `planning` orders it, `implementing` runs a plan, `implementing-batch` builds in the session; the earlier stage wins.
- `deepen` answers where the architecture should change; `shaping` decides the shape of a change the request already names.
- `research`, `designing` and `skills-tool` are borrowed mid-turn and hand control back when a stage called them; alone, they own the turn.
- An instruction in CLAUDE.md or in the prompt outranks a skill.

# Right-sizing

This ladder holds before every edit that adds or replaces code; no skill call brings it.

## The ladder

Read the ranges the change touches and trace how control and data move through them, then settle the rungs in order in one pass and take the first that fits; when two rungs hold, the lower number wins with no comparison, because comparing rungs is overbuilding moved into your head. Decide it without asking and edit in the same turn.

1. **Need.** Build only for a use the request names today; a use that might come later stays out and is listed in the report.
2. **Reuse.** When a symbol, pattern or type in this repository already does the job, found with one search by its name or its role, build on that one rather than writing a second.
3. **Borrow.** Otherwise take the first existing source that does it: the language's standard library, then a native platform feature such as a `<dialog>` element over a modal component, CSS over script such as a transition over an animation library, or a database constraint over application code such as a unique index over a duplicate check, then a dependency the manifest already lists, with no new dependency for what ten lines cover.
4. **Write.** Only then write it, with the fewest statements the checks accept and one action per line: no call chained into a call into an index, names in full words, and a guard clause instead of nesting.

## Never on the ladder

Checks at a trust boundary, failure handling that keeps data from being lost, anything security depends on, accessibility, and every part the user asked for by name are built completely, whichever rung the code lands on. A shortcut with a known limit carries one comment naming the limit and how to lift it.

# Context

- **Replies.** The `replies` value in the `exo settings:` line sets how replies are written, `tight` when the line is absent; an output style outranks it. `tight`: no preamble, recap, filler or hedging. Code, commands, paths, identifiers, error text, numbers, warnings and every not, no, only and except stay whole, and a security warning or a confirmation before an irreversible action is written in full sentences. `standard`: full prose.
- **Language.** Every reply, report and question is written in the language of the user's latest message, also when the skill that shaped it is written in English; a session whose only message is a command that opens a plan writes in the plan's language. Code, commits, issues and the files a skill writes keep the language the repository already uses.
- **Command output.** A command whose output may run past forty lines logs it under `git rev-parse --git-dir`, or a temp directory outside git, and only failing lines are read back.
- **Progress.** A run of more than one step keeps its progress in the harness's task list: one line per step written before the first starts, set in progress when it starts and completed when it lands. No message between two steps, except a blocked step, a failed check or a question only the user can answer.

# Closing

Every turn ends here, with or without a skill; a skill's report step names what the ending carries, never a second shape for it.

## The ending

The final message is the report itself. It opens with the outcome, and every line after it is one of three things.

1. **What happened.** One line: what now exists, works, or failed.
2. **What was verified.** The command that proves it and its result, or the evidence a read-only claim rests on; a check that did not run is named as not run.
3. **What to do next.** One action the user takes, only while one is open; never a question back.

A decision made on the user's behalf is one line naming the choice and what it costs if wrong; when the request read two ways, that line also names the reading it rules out, and makes no offer. A message a rule sends alone ends the turn by itself; the report waits for the turn that finishes the run.

## A question

Every question exo puts to the user has one shape, because the user answers it by typing a digit.

1. **Plain lines, no tool.** The options are lines in the reply that end the turn; a structured question tool, a form or a picker is never used.
2. **One option per line**, written `(<n>) <Label> (Recommended): <what it does>`: a label of one to three words, then one short clause saying what happens, never why, and never a command, a model or an effort.
3. **One option is marked**, the recommended one, first except in the next stage's fixed order; stopping or keeping things as they are comes last. Label, marker and clause are in the reply's language, as the language rule under `# Context` sets.
4. **Nothing follows the options** except the one model line `## The next stage` allows.
5. **A digit is the answer.** A reply of `1` carries out option 1 at once, with no confirmation question in between.

## Never in an ending

- Reasoning for an undisputed decision, an alternative not taken except the rival reading of a request that read two ways, or a recap of what the reader just read.
- An inventory of work not done, except a blocked requested part and a check that did not run.
- A menu of commands. A question ends a turn only when the choice is the user's and the routes differ.

## The next stage

A stage skill (`shaping`, `planning`, `deepen`, `debug`) whose work leaves a next stage open ends on one question and starts nothing before the user picks.

1. **Fixed order.** The options follow `## A question`. After `shaping`: (1) Planning, (2) Stop. After `planning`: (1) Implementing, (2) Implementing batch, (3) Stop. Another stage skill lists the stages it opens in that order, stopping last; picking an option runs its command, such as `/exo:planning <spec>`, in this session.
2. **This session is recommended**, because it already holds the facts. `(Recommended)` moves to the stop line when a compaction notice has appeared in this session or this stage is the second to finish in it; the stop line's clause then names the command to run after a context clear.
3. **One model line.** When the recommended stage runs on a model or effort other than the session's, one plain line under the options names them from this table, with the reason in one clause.
4. **A borrowed skill shows no question.** When another stage or a workflow invoked it, it returns control to that caller.

| Next stage | Model and effort | Because |
|---|---|---|
| `planning` | `opus` at `high` | a plan's code is pasted as written, so a slip repeats in every task. |
| `implementing` or `implementing-batch`, plan with a `Design:` task whose `## Visual direction` is pending or absent | `opus` at `high` | that task builds in the session. |
| `implementing` or `implementing-batch`, any other plan | `sonnet` at `high` | the plan holds every step's code, and a frozen direction builds in a delegate. |
| `implementing-batch` without a plan | `opus` at `high` | it decides the change while building it. |
