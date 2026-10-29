# Decided for you benchmark

Measures **questions asked per task**: how often a session stops to ask about a choice that has a safe default.

Each folder holds one task:

- `task.json`: `split` (`train` or `held-out`), `choice` (the default a session should take), `alternative`, `timeoutMinutes`.
- `prompt.md`: the user prompt, which leaves the choice open.
- `seed/`: the repository a cell starts from.
- `hidden-default/`, `hidden-alternative/`: `hidden-check.mjs`, copied over the repository after the session.
- `solution-default/`, `solution-alternative/`: the file that passes each check.
- `check.mjs <repo> default|alternative`: runs the hidden check and prints one JSON line.

4 tasks are train and 2 are held-out.

## Run

- `node benchmarks/decided.mjs --dry-run` prints the cells and projected USD.
- `node benchmarks/decided.mjs` is the quick tier: 1 train task, arms `exo-before,exo`, 1 run, sonnet, `--max-total-usd 2`.
- `--full` runs every train task with 3 runs per arm; `--split held-out` runs the held-out tasks with 3 runs per arm into `results/decided-held-out.json`.
- `--full` and `--split` refuse `--runs` below 3. `--max-budget-usd` (default 1.5) caps each session.

## Score

Turn 1 runs with `--output-format stream-json`. Each `AskUserQuestion` call and each final-reply line ending in `?` is one question. The score is the mean per arm.

- Target, held-out: exo's mean is at most 0.5 times the `exo-before` mean and `compareMeans` returns `fall`. The hidden pass rate of exo must not fall against `exo-before`.
- Wrong-default rate: cells that asked nothing, failed the default check and passed the alternative check.
- One-reply reversal rate: cells whose turn 1 passes the default check and whose turn 2, the reply `1` sent through `--resume`, passes the alternative check.

Results are written to `benchmarks/results/decided.json` (train and full tiers) and `benchmarks/results/decided-held-out.json` (held-out split).
