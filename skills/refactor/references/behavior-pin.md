# Behavior pin

A pin records what the code does now, so the refactor is judged against old outputs, not intent. Grading against intent lets a bug already shipped as behavior survive unnoticed. Overcorrection: a pin so exhaustive it stalls the refactor. Write it before the first structural edit; rerun after every step.

## Choosing the pin

| Situation | Pin |
|---|---|
| Tests already call the code and cover its branches | Existing suite; check a branch you are about to move is actually exercised. |
| No tests, pure function | Throwaway script running old and new function over the same generated inputs, counting mismatches. |
| No tests, output is a file, page or report | Snapshot of the output taken before, diffed after. |
| Side effects: network, storage, time | Record the calls against a fake before the move; compare the call log after. |

Type check, lint and "it builds" are never the pin: they pass when a value changes and the shape does not.

## Old against new

Keep the old version runnable beside the new until the comparison passes, then delete it:

1. Copy the original to a scratch file outside the source tree, or load it with `git show HEAD:<path>`.
2. Generate inputs over every branch boundary: each threshold, enum value, flag combination, plus empty and extreme cases.
3. Run both, count mismatches, print the first few with their inputs.
4. Quote count and input range in the report; zero mismatches over one input proves one input.

## What the pin does not settle

- Whether the new shape reads easier: loop step 7 judges that.
- Behavior wrong before the refactor: pin keeps it wrong on purpose; fix is a separate change after the refactor lands.

## Judgment

- Pin outranks a build, type check or lint pass; none prove outputs matched.
- Mismatch you did not predict → old behavior was misread; read it again before moving on, never wave it through.
- One-input pin outranks nothing; widen the input range before trusting zero mismatches.
