# Measured goal

This page plans a measured Goal, so the result is a number that a paired run can tell apart from noise. It applies when the Goal is a measured score, cost or time on a task set. Tasks run with `benchmarks/tbench/`.

## Steps

1. Calibrate on the current model and harness before any comparison: run the task set at least 2 trials per task, then `node benchmarks/tbench/readouts.mjs --job <job dir>=<arm> --calibrate`.
2. When fewer than 4 tasks are mixed (some pass, some fail), the set is saturated, so stop and plan no paired wave.
3. Size the wave with `node benchmarks/mde.mjs --rate <calibrated pass rate> --n <runs per arm>`; the plan states the minimum detectable effect. A Goal smaller than that effect is not measurable.
4. Ablate a removal as one block per arm: each arm differs by that one removal, nothing else.
5. Run every task in every arm, then read the results paired. `readouts.mjs --job <job dir>=<arm>` per arm gives cost per task, agent wall apart from setup wall, and a within-task sign test beside the pooled bootstrap.
   - Skip Wilcoxon, because 5-8 tasks give it no power over the sign test.
6. For failing trials, one delegate reads the raw failing transcripts that `readouts.mjs` lists and classes each failure into `.exo/<topic>/failures.md`. This session reads that file, not the transcripts.
   - Label each failure agent fault or case fault, a case fault being an ambiguous or unsolvable case, and send case faults to the user, because the agent cannot fix them.
7. Pick a setting only when `node benchmarks/mde.mjs --rate <r> --n <n> --scores <arm scores>` prints no line ending `ranks no setting`. Such a line means every arm scores at or above 0.95 or all arms score the same, so the ledger records "at ceiling, no ranking" or "no spread, no ranking" and no setting changes, since these scores cannot rank arms.
