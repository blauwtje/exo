# build

Runs a plan, one task per fresh builder; a long chain lands up to four tasks per fresh builder. Without a plan, it builds a decided change in this session.

## When it runs

- You say to run or resume a plan.
- A decided change with no plan touches more than two files, adds a dependency, changes a public signature, or crosses a persisted format or security boundary.
- You ask for a change test-first, at any size.

Not for writing or repairing a plan, or a change of two files or fewer.

## What you get

- One commit per task, so a resumed run knows what landed. A task lands when its proof passes and the plan's Land gate passes; a proof that also passes before the change is refused, and the builder stops on that refusal and reports the task as blocked.
- Each builder, and this session when it edits a no-plan change itself, reads `skills/build/references/code-rules.md` before it writes code and cleans its own diff against it; the project's own lint, run by the Land gate, decides style.
- A point the plan leaves open is parked, not guessed: you get one question, and that task is rebuilt with your answer.
- At the end, the plan's Success criterion runs once, then the plan's Land gate once, then one review of the branch diff by the built-in `code-review` skill at `medium`, or `high` for a large diff or a plan that crosses a security boundary or a persisted format; each finding goes to a builder that must reproduce it with a failing test or command, only the reproduced ones are fixed, and the rest are listed as unproven.
- A short final message in plain words that gives the run's tokens and minutes, then a handoff to `ship`.

## Source

`skills/build/SKILL.md` and its `references/`.
