# gate

Checks a finished plan's branch, reviews it and fixes what the review finds.

## When it runs

Every task in a plan has landed and the branch needs checking before a pull request.

Not for a change without a plan; use `review`.

## What you get

- Each task's proof command and the plan's success check, run once.
- Every task marked done or open, plus the checks only you can make.
- One review of the branch, picked by risk and asked three to five concrete questions, then a model-free list of files and names several tasks changed.
- Review findings that cite the rule they break, grouped by category and sorted by usefulness score; uncited ones cannot block and low-score ones are counted, not listed.
- Review findings fixed in one commit.
- A handoff to `ship`.

## Modes

This skill also runs the folded skills review as modes.

## Source

`skills/gate/SKILL.md` and `skills/gate/scripts/gate.mjs`.
