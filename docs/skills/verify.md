# verify

Checks a finished plan's branch, reviews it and fixes what the review finds.

## When it runs

Every task in a plan has landed and the branch needs checking before a pull request.

Not for a change without a plan.

## What you get

- Each task's proof command and the plan's success check, run once.
- Every task marked done or open, plus the checks only you can make.
- One review per landed task, picked by risk and asked three to five concrete questions, then a model-free list of files and names several tasks changed.
- Review findings fixed in one commit.
- Each defect the review found booked as a candidate lesson, which `remember` asks you about once a second session repeats it.
- A handoff to `ship`.

## Source

`skills/verify/SKILL.md` and `skills/verify/scripts/verify.mjs`.
