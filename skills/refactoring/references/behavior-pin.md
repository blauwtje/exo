# Behavior pin

A pin records what the code does now, so the refactor is judged against the old outputs rather than against what the code was meant to do. It is written before the first structural edit and rerun after every step.

## Choosing the pin

| Situation | Pin |
|---|---|
| Tests already call the code and cover its branches | The existing suite; check a branch you are about to move is actually exercised. |
| No tests, pure function | A throwaway script that runs the old and new function over the same generated inputs and counts mismatches. |
| No tests, output is a file, page or report | A snapshot of the output taken before, diffed after. |
| Side effects: network, storage, time | Record the calls against a fake before the move and compare the call log after. |

Type check, lint and "it builds" are never the pin: they pass when a value changes and the shape does not.

## Old against new

Keep the old version runnable beside the new one until the comparison passes, then delete it:

1. Copy the original to a scratch file outside the source tree, or load it from git with `git show HEAD:<path>`.
2. Generate inputs over every branch boundary: each threshold, each enum value, each flag combination, plus the empty and extreme cases.
3. Run both, count mismatches, and print the first few with their inputs.
4. Quote the count and the input range in the report; a pin that reports zero mismatches over one input proves one input.

A comparison that fails is informative only when the mismatch is the one you predicted; an unexpected mismatch means the old behavior was misread, so read it again before moving on.

## What the pin does not settle

- Whether the new shape is easier to read: step 7 of the loop judges that.
- Behavior that was wrong before the refactor: the pin keeps it wrong on purpose, and the fix is a separate change after the refactor lands.
