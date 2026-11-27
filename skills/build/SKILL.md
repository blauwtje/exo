---
name: build
description: "Builds a planned change task by task, each proof seen failing then passing, and reviews it once. Use when the user says 'build this', 'implement X' or 'run the plan'. Not for unknown bugs."
argument-hint: "[plan path] [--land]"
---

# Build

**Red, green, commit: one task at a time.** A task is done when its proof failed before your change and passes after it. Nothing else counts: not a builder's summary, not a clean compile, not "should work".

A typo or a one-line edit needs no plan: make it and run the check.

## Before the first task

- **Branch.** Use the branch the request names, else the current one. On `main`, create a branch named after the plan.
- **Plan.** Copy the plan to `<scratch>/<topic>.md`. With no plan, the decided change is one task: write its proof first.
- **Baseline.** Run the plan's `Commit check:` once. If it already fails, that is a bug, not your task: hand it to `exo:diagnose`.

## The loop

Take the first task whose number no `Plan-task:` trailer in `git log` names and whose `Depends on:` tasks have landed. Repeat until none is left.

1. **Red.** Run the task's `Proof:`. It must fail, unless the task says `Red: none`. A proof that already passes means the plan is wrong: send it back to `exo:spec`.
2. **Build.** Do a task that touches one file yourself. Send a larger one to a fresh `exo:builder` with the plan copy, the task number, the checkout and a report path in `<scratch>`; it does not commit. A task's `Model:` field sets the builder's `model` and `effort`. A fresh builder keeps your context on the plan and keeps the one who did the work apart from the one who judges it.
3. **Green.** Run the proof and the commit check yourself. Both pass: commit with the task title as the subject and a `Plan-task: <n>` trailer. That trailer, not anyone's summary, is how you and a later session know what landed.

   Before each commit:

   - [ ] the proof failed first, or the task says `Red: none`
   - [ ] you ran the proof yourself and it passes
   - [ ] the commit check passes
   - [ ] the commit holds one task and its `Plan-task:` trailer
4. **Not green.** Read the builder's status line:
   - `BLOCKED`: report its reason to the user, stop that task, and go on with tasks that do not depend on it.
   - `NEEDS ANSWER`: ask the user, then resend the task with the answer.
   - `PLAN WRONG`: note it in the plan and hand it to `exo:spec`.
   - A failed proof: one fresh builder gets the failing lines. Unless the failure was missing input, give that builder `model: opus` and `effort: high`. A second failure goes to `exo:diagnose`.

## After the last task

1. **Review once.** Run the `code-review` skill on the branch diff. For each important finding, a builder first writes a test that shows it failing, then fixes it. Drop a finding nobody can reproduce.
2. **Success criterion.** Run the plan's `Success criterion` once. A failure gets one fix and one rerun.
3. **Report** from `git log` and `git diff --stat`, not from memory.

## Excuses

| You think | Do instead |
|---|---|
| "The builder says it passes." | Run the proof yourself. |
| "This task is too small for a red proof." | Then the proof takes a minute. Without red you cannot tell it tested anything. |
| "I'll fix the review findings directly." | Show each one failing first, or you cannot tell it was real. |
| "These two tasks touch one file; I'll do both at once." | One task, one commit. A mixed commit cannot be reverted alone. |

## Report

```text
Built 4 of 5 tasks on feat/csv-export. Task 5 is blocked: it needs the delimiter choice.
Proof: each landed task failed before and passes after (see the Plan-task trailers).
Review: 2 findings, both reproduced and fixed.
Not run: the manual check of the download button.
```

Next: `exo:ship`, unless the user ruled out a push. Pass `--land` on.
