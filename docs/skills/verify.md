# verify

Checks a finished plan's branch, reviews it and fixes what the review finds.

## When it runs

Every task in a plan has landed and the branch needs checking before a pull request.

Not for a change without a plan.

## What you get

- Each task's proof command and the plan's success check, run once.
- Every task marked done or open, plus the checks only you can make.
- One review of the whole branch.
- Review findings fixed in one commit.
- A handoff to `ship`.

## Source

`skills/verify/SKILL.md` and `skills/verify/scripts/verify.mjs`.
