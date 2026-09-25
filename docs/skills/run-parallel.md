# run-parallel

Fans one job out to N parallel workers and returns one report, or in contest shape one artifact built from the best of N candidates, with every rule that judges them fixed before the first worker runs.

## When it fires

Only when the user invokes it, naming a shape: coverage splits a scope into disjoint slices, race runs one brief N times, gauntlet runs N distinct checks against one artifact, and contest has N candidates build the same thing. A plan's tasks belong to run-plan, which fans them out in waves, and a single read-only lookup to the locate-code agent.

## What you get

- A frame file written before any spawn, holding the done predicate, each worker's slice and output path, and the selection rule, gauntlet rule or contest rubric.
- Workers on `sonnet`, each in its own worktree or output file, each returning a one-line verdict and writing its full detail to that file.
- For coverage, race and gauntlet: one table with a row per worker, evidenced one-line issues, gaps and dropouts, where a gap never counts as a pass.
- For contest: a read-only judge on `opus` (or `sonnet` when the candidates ran on `opus`) that scores after all candidates finish, a full reading of every candidate by the session itself, a base picked on the rubric, parts of the others grafted by hand, and a synthesis note naming base, grafts, rejections and the verification result.
- Wide divergence among candidates ends in a reframe and a rerun, never an average.

## Where its rules live

`skills/run-parallel/SKILL.md`, with `worker-prompt.md` and `judge-prompt.md` beside it.
