# Measured goal

Scope: the Goal is a measured score, cost or time on a task set. Tasks run with `benchmarks/tbench/`.

## Steps

1. Calibrate on the current model and harness before any comparison: run the task set at least 2 trials per task, then `node benchmarks/tbench/readouts.mjs --job <job dir>=<arm> --calibrate`.
2. Fewer than 4 mixed tasks (some pass, some fail) → saturated: stop, plan no paired wave.
3. Size the wave with `node benchmarks/mde.mjs --rate <calibrated pass rate> --n <runs per arm>`; the plan states the minimum detectable effect, and a Goal smaller than it is not measurable.
4. Ablate a removal as one block per arm: each arm differs by that one removal, nothing else.
5. Run every task in every arm, then read paired: `readouts.mjs --job <job dir>=<arm>` per arm gives cost per task, agent wall apart from setup wall, and a within-task sign test beside the pooled bootstrap. No Wilcoxon: 5-8 tasks give it no power over the sign test.
6. Failing trials → one delegate reads the raw failing transcripts that `readouts.mjs` lists and classes each failure into `.exo/<topic>/failures.md`; the lead reads that file, not the transcripts.
