# verify

Runs a landed plan's gate, reviews the branch and repairs what the review finds.

## When it fires

A plan's tasks are all landed and the branch needs the scripted checks and a review before a pull request. It does not land a task itself, and it does not fire for a decided change with no plan.

## What you get

- Each landed task's own Proof command, the plan's success criterion and a stray-path check, run once and reported.
- One branch review, dispatched to the model the gate printed.
- Findings repaired by a delegate and landed in one commit.
- The finish question `ship` asks, whose pick is carried out to its end.

## Where its rules live

`skills/verify/SKILL.md`, with `scripts/verify.mjs` beside it.
