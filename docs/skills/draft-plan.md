# draft-plan

Turns a decided change into a plan another session can execute without interpreting it.

## When it fires

A plan is asked for, a read-only planning mode is active, another session or executor will run the work, or the work holds two or more edit-order dependencies. A shaped issue goes straight to draft-plan and is never shaped again.

## What you get

- One plan file, holding every task in dependency order, each with the code it writes, the command that proves it and the result to expect.
- A basis section naming the repository, the branch, the versions and every command the planning session could not run itself.
- Non-goals the executor treats as hard boundaries.
- A question offering run-plan or build-change, with the model each wants.

## Where its rules live

`skills/draft-plan/SKILL.md`, with the artifact shape in its `references/plan-spec.md`.
