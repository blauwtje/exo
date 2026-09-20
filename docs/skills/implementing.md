# implementing

Runs a plan file, one task per fresh context.

## When it fires

A session opens on a plan to run, or you say to run or resume one. It does not author or repair a plan, and it does not build a change that has no plan file.

## What you get

- One commit per task, carrying the task number, so a resumed session knows what has landed.
- Independent tasks built together in worktrees of their own.
- One branch review at the end, against the plan and the written code standard.
- A report naming what passed, what failed and what did not run.

## Where its rules live

`skills/implementing/SKILL.md`, with the delegate prompts beside it.
