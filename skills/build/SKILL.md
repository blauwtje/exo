---
name: build
description: "Builds a change with a proof for each step and one review of the result. Use when the user asks to build, implement, add or change behavior ('add X', 'implement this', 'make Y do Z'), or to run or resume a plan ('run the plan'). Not for a typo or one-line edit, writing a plan, or a bug whose cause is unknown."
argument-hint: "[plan path] [--land]"
---

## Principles

- A task lands only when its Proof failed before the change and passes after, because a proof that passes without the change proves nothing.
- Each task goes to a fresh `exo:builder`, because nobody grades their own work.
- Only a `Plan-task: <n>` commit trailer shows what landed, because a builder's summary can overstate.
- Two failures of one task stop it, because a third try repeats the premise.

## Steps

1. Read `${CLAUDE_PLUGIN_ROOT}/BASE.md`.
2. Use the branch the request names, else the current one; on `main`, create one named after the plan topic. Push only through `exo:ship`. With no plan, treat the decided change as one task whose Proof you write first.
3. Copy the plan to `<scratch>/<topic>.md`.
4. Run the `Land gate:` once; hand a failure already there to `exo:diagnose`.
5. Take the first task whose number no `Plan-task:` trailer in `git log` names and whose `Depends on:` tasks landed. None left goes to step 9.
6. Run its Proof: it must fail unless the task says `Red: none`. A passing Proof goes to `exo:spec`.
7. Send the task to a fresh `exo:builder` with the plan copy, task number, checkout and a scratch report path; it does not commit. The task's `Model:` line sets the Agent tool's `model` and `effort`, else the table.
8. Run the Proof and the Land gate yourself. Both pass: commit with the task title as subject and a `Plan-task: <n>` trailer, then go to step 5.
   - A failure goes to one fresh builder on a second-attempt row with the failing lines; a second failure goes to `exo:diagnose`.
   - `NEEDS ANSWER`: ask the user, then resend the task with the answer.
   - `PLAN DRIFT`: log it in the plan and hand it to `exo:spec`.
9. Review the branch diff once with the `code-review` skill; a builder writes a failing repro for each important finding, then fixes it. Drop findings nobody reproduces.
10. Run the `Success criterion` once; a failure gets one fix and one rerun.
11. Report from `git log` and `git diff --stat`: tasks landed, findings, `Noticed:` lines, what did not run. End on `exo:ship` unless the request rules out a push; pass `--land` on.

| Job | Who | Model, effort |
|---|---|---|
| Build a task | `exo:builder` | Sonnet, medium |
| Second attempt, missing input | `exo:builder` | Sonnet, medium |
| Second attempt, other failure | `exo:builder` | Opus, high |
| Code lookup | `exo:researcher` | Haiku, high |
| Research | `exo:researcher` | Sonnet, medium |
