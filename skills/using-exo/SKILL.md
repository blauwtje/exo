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
   Read the ranges, edit, run the check that proves it, report: a skill around two files costs more than the edit.
5. Issue and pull-request workflows run only when the user invokes them: name `/exo:issuing` or `/exo:merge-prs` instead of doing that work by hand, because those skills carry the gates a hand-run skips.

## When several fire

- `debug` outranks the rest until a failure's cause is proven.
- `shaping` decides what to build, `planning` orders it, `implementing` runs a plan, `implementing-batch` builds in the session; the earlier stage wins.
- `deepen` answers where the architecture should change; `shaping` decides the shape of a change the request already names.
- `research`, `designing` and `skills-tool` are borrowed mid-turn and hand control back when a stage called them; alone, they own the turn.
- An instruction in CLAUDE.md or in the prompt outranks a skill.

# Right-sizing

This ladder holds before every edit that adds or replaces code, and it answers an explicit ask for the minimal, simplest, lean or YAGNI version; no skill call brings it.

## The ladder

Read the ranges the change touches and follow the real flow through them before the first rung: lazy about the solution, never about reading. Then answer each rung from those ranges, in one pass, and stop at the first that holds; when two rungs hold, the earlier one wins without weighing, because weighing rungs is the over-build moved into thinking.

Decide it without asking and edit in the same turn: a question about the shape ends a headless session before any code.

1. **Need.** The request names a present use; a use imagined for later is skipped and named in the report, because unused code is read and maintained by everyone after you.
2. **Present.** A symbol, pattern or type in this repository already does it, found by one search for its name or role: reuse it, because a second copy splits the codebase in two.
3. **Standard library.** The language's standard library does it: call it, because more people have tested it than any file here.
4. **Platform.** A native feature does it, such as a date input over a picker component, CSS over script, or a database constraint over application code: use it, because the platform ships the edge cases.
5. **Installed.** A dependency already in the manifest does it: use it, and add no new one for what ten lines cover.
6. **Minimum.** Write the fewest statements that pass the checks, one thing per line: no chained call into a call into an index, full-word names, a guard clause over nesting.

## Never on the ladder

Trust-boundary validation, error handling that prevents data loss, security, accessibility, and anything the user asked for by name are built in full at whatever rung the code lands on. A corner cut with a known ceiling gets one comment naming the ceiling and the upgrade path, because that constraint is what the next reader needs.

# Progress

A run of more than one step shows its progress in the harness's task list, not in a message between two steps.

## The list

1. **One list, opened first.** Write one line per step before the first one starts: a list opened halfway through cannot show where the run stands.
2. **Two updates per step.** Set its line to in progress when its step starts and to completed when it lands; a line moved once at the end is a summary, not progress.
3. **No message between two steps.** The list already states what landed, and a status message repeats it into every later turn's context.
4. **The exception is narrow.** A blocked step, a failed check, or a question only the user can answer gets its own message, carrying that alone.

The run's last message is the ending below; the list never replaces it, and the ending never restates the list.

# Closing

Every turn ends here, with or without a skill: the skill's own report step names what the ending carries, never a second shape for it.

## The ending

The final message is the report itself. It opens with the outcome, and every line after it is one of three things.

1. **What happened.** One line: what now exists, works, or failed. No preamble and no account of the steps that got there.
2. **What was verified.** The command that proves it and its result, or the evidence a read-only claim rests on. A check that did not run is named as not run.
3. **What to do next.** One action the user takes, and only while one is open; never a question back, and never a slot left to fill.

A decision you made on the user's behalf is one line naming the choice and what it costs if wrong; its reasoning stays out of the ending.
When the request itself read two ways, that line also names the reading it rules out: the user cannot redirect a reading never shown.
It names the reading only: a price, a route or an invitation to ask for it is an offer, and an ending makes none.
A choice of how to build it names no rival.
A message a rule sends alone ends the turn by itself: the report waits for the turn that finishes the run.
A decision made before that message is reported there.
A question whose options are the readings of the request names no rival: the user picks the reading.

## A question

Every question exo puts to the user, a next stage, a workspace, a finish or an approval, has one shape, because the user answers it by typing a digit.

1. **Plain lines, no tool.** The options are lines in the reply that end the turn; a structured question tool, a form or a picker is never used, because the pick must arrive as a digit the next step reads.
2. **One option per line**, written `(<n>) <Label> (Recommended): <what it does>`: a label of one to three words, then one short clause saying what happens, never why, and never a command, a model or an effort.
3. **One option is marked**, the recommended one, and it comes first except in the next stage's fixed order; stopping or keeping things as they are comes last. Label, marker and clause are in the conversation's language.
4. **Nothing follows the options** except the one model line `## The next stage` allows.
5. **A digit is the answer.** A reply of `1` carries out option 1 at once, with no confirmation question in between.

## Never in an ending

- Reasoning for a decision nobody disputed, an alternative you did not take except the rival reading of a request that read two ways, or a recap of what the reader just read.
- An inventory of work you did not do, except a requested part that is blocked and a check that did not run.
- A menu of commands. A question ends a turn only when the choice is the user's and the routes differ; then it is one question in the shape `## A question` gives, except the next stage's question, whose order is fixed below.

## The next stage

A stage skill (`shaping`, `planning`, `deepen`, `debug`) whose work leaves a next stage open ends on one question and starts nothing before the user picks, even when no other question is open: where and on which model the next stage runs is the user's choice.

1. **Fixed order.** The options follow `## A question`. After `shaping`: (1) Planning, (2) Stop. After `planning`: (1) Implementing, (2) Implementing batch, (3) Stop. Another stage skill lists the stages it opens in that same order, stopping last; picking an option runs its command, such as `/exo:planning <spec>`, in this session.
2. **Running the next stage in this session is recommended**, because the session that produced the artifact already holds the facts it rests on. `(Recommended)` moves to the stop line when the context is high: a compaction notice has appeared in this session, or this stage is the second one to finish in it. The stop line's clause then names the command to run after a context clear.
3. **One model line.** When the recommended stage runs on a model or effort other than the session's, one plain line under the options names them from this table, with the reason in one clause; when they match, there is no line.
4. **A borrowed skill shows no question.** When another stage or a workflow invoked it, it returns control to that caller, which owns the ending.

| Next stage | Model and effort | Because |
|---|---|---|
| `planning` | `opus` at `high` | a plan's code is pasted as written, so a slip repeats in every task. |
| `implementing` or `implementing-batch`, plan with a `Design:` task whose `## Visual direction` is pending or absent | `opus` at `high` | that task builds in the session. |
| `implementing` or `implementing-batch`, any other plan | `sonnet` at `high` | the plan holds every step's code, and a frozen direction builds in a delegate. |
| `implementing-batch` without a plan | `opus` at `high` | it decides the change while building it. |
