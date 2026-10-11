# exo value benchmark: test pollution, seven versions of find-cause

Measured whether exo's `find-cause` skill beats a bare session on `value-test-pollution`: the visible failure is one order-dependent test, and three cross-tenant state leaks sit behind it. The prompt is `benchmarks/value/test-pollution/prompt.md`: make the suite pass in any file order, tests unchanged. A runner flag or a fix for one leak leaves the suite order-dependent. The hidden check runs the original tests in eight fixed file orders, then hidden unit tests that hit each leak.

Seven runs of the same task, each with a different exo version, all on the same day. Arms `baseline` and `exo`, Sonnet 5.5 (`claude-sonnet-5-5`) at the CLI's default effort, Claude Code 2.1.296, 5 runs per arm and run, 70 cells in all, fixture `full-stack-fastapi-template` at `cd83fc1`. No cell errored. The runs were launched from `benchmarks/run.mjs` with `--tasks value-test-pollution`; the exact command line is not recorded in the run directories.

The numbers are what `node benchmarks/score.mjs <dir>` prints for each run directory. `--publish` does not accept a run that holds value cells only, so this file is written by hand. Cells are mean ± standard error over 5 runs. `defects` counts failed hidden checks (lower is better). `cost / success` is blank (`none`) when no cell passed.

## What changed in find-cause

| Version | Plugin commit | Change versus the previous version |
|---|---|---|
| v1 | `43dfab80` (0.123.0) | Starting point on `main`. |
| v2 | `1a624041` | No `find-cause` file changed. The session hook now injects the routing rules at session start (`ca39ceed`, `hooks/session-routing.md`), plus other hook and doc commits (context limits, benchmark exo-loaded detection). |
| v3 | `b2880b29` | `find-cause` ends only when the user's success condition passes (`ebf69ea7`: `SKILL.md`, both prompts, `handoff.md`, `loop.md`). The commit itself only adds the changelog line. On branch `feat/find-cause-success`, unmerged. |
| v4 | `7c6de78a` | Puts the user's criterion first and reruns Success in the lead (`SKILL.md`, `investigator-prompt.md`, `handoff.md`, `loop.md`). |
| v5 | `5b75b702` | States the Success rule in the skill body (`SKILL.md`). |
| v6 | `1deec561` | Requires a Success that can fail, and sweeps the pattern (`SKILL.md`). |
| v7 | `9197f14f` | Sweeps the cause's kind, and counts only a Success whose run varies (`SKILL.md`). |

## Results

| Version | Arm | n | pass | defects | LOC added | tokens | cost | wall time | cost / success |
|---|---|---|---|---|---|---|---|---|---|
| v1 | baseline | 5 | 20% ±20% | 8.0 ±2.0 | 3 ±2 | 42k ±15k | $0.08 ±$0.03 | 0.4m ±0.1m | $0.42 |
| v1 | exo | 5 | 0% ±0% | 10.0 ±0.0 | 1 ±0 | 39k ±2.3k | $0.08 ±$0.00 | 0.3m ±0.0m | none |
| v2 | baseline | 5 | 0% ±0% | 10.0 ±0.0 | 1 ±0 | 38k ±5.6k | $0.07 ±$0.01 | 0.3m ±0.0m | none |
| v2 | exo | 5 | 0% ±0% | 10.0 ±0.0 | 1 ±0 | 48k ±5.4k | $0.10 ±$0.01 | 0.4m ±0.0m | none |
| v3 | baseline | 5 | 0% ±0% | 10.0 ±0.0 | 1 ±0 | 29k ±2.7k | $0.06 ±$0.00 | 0.3m ±0.0m | none |
| v3 | exo | 5 | 0% ±0% | 8.8 ±1.2 | 1 ±0 | 47k ±6.6k | $0.09 ±$0.01 | 0.4m ±0.1m | none |
| v4 | baseline | 5 | 0% ±0% | 10.0 ±0.0 | 1 ±0 | 28k ±2.1k | $0.06 ±$0.00 | 0.3m ±0.0m | none |
| v4 | exo | 5 | 0% ±0% | 10.0 ±0.0 | 1 ±0 | 41k ±952 | $0.08 ±$0.00 | 0.3m ±0.0m | none |
| v5 | baseline | 5 | 0% ±0% | 10.0 ±0.0 | 1 ±0 | 33k ±2.5k | $0.07 ±$0.00 | 0.3m ±0.0m | none |
| v5 | exo | 5 | 0% ±0% | 10.0 ±0.0 | 1 ±0 | 65k ±10k | $0.13 ±$0.02 | 0.5m ±0.1m | none |
| v6 | baseline | 5 | 0% ±0% | 10.0 ±0.0 | 1 ±0 | 28k ±2.3k | $0.06 ±$0.00 | 0.3m ±0.0m | none |
| v6 | exo | 5 | 0% ±0% | 10.0 ±0.0 | 1 ±0 | 43k ±2.3k | $0.08 ±$0.00 | 0.3m ±0.0m | none |
| v7 | baseline | 5 | 0% ±0% | 10.0 ±0.0 | 1 ±0 | 27k ±1.9k | $0.05 ±$0.00 | 0.2m ±0.0m | none |
| v7 | exo | 5 | 0% ±0% | 10.0 ±0.0 | 1 ±0 | 55k ±4.7k | $0.11 ±$0.01 | 0.5m ±0.1m | none |

## Findings

- **exo never passed.** 0 of 35 exo cells passed, in any version. In six of seven versions every exo cell scored 10.0 defects. The exception is v3 at 8.8 ±1.2, a mean that sits about one standard error from 10.0; it is not a result to build on.
- **The baseline passed once.** 1 of 35 baseline cells passed (v1, 1 of 5); the other four v1 cells and every v2 to v7 baseline cell scored 10.0 defects. The v1 baseline mean of 8.0 ±2.0 is that one pass averaged with four fails.
- **Pass is within noise.** At 0 to 20% with n=5, a single cell is the whole difference. v1 baseline (1 of 5) against v1 exo (0 of 5) is not a difference, and the same baseline scored 0 of 5 in each of v2 to v7. No version of find-cause made exo pass.
- **Lines added.** Both arms added 1 line in nearly every cell (v1 baseline 3 ±2).
- **Tokens and cost: exo costs more.** exo used 39k to 65k weighted tokens per cell against 27k to 42k for the baseline. From v2 on, exo cost $0.08 to $0.13 per cell against $0.05 to $0.07. Since almost no cell passed, `cost / success` is `none` everywhere except v1 baseline ($0.42). The baseline's own cost moves between runs of the same setup ($0.08, $0.07, $0.06, $0.06, $0.07, $0.06, $0.05), so the gap in one run is not comparable to the gap in another.

## Limitations

- n=5 per arm and version. A move from 0 of 5 to 1 of 5 is a 20-point change; nothing smaller than that can show.
- One task, one fixture. `value-test-pollution` says nothing about other bugs.
- The versions are not independent. They share the model, the fixture, the day, and mostly the same skill text; v3 to v7 are successive edits to the same skill, each run on this task.
- The baseline arm is not a fixed control across runs: it passed 1 of 5 in v1 and 0 of 5 in v2 to v7, and its tokens and cost differ between runs, which is the noise level of this measure.
- v3 to v7 ran from `feat/find-cause-success`, which is unmerged. Their plugin commits are on that branch only.
- Raw cells sit in `benchmarks/runs/2026-10-11-test-pollution` and `-v2` to `-v7`, which are git-ignored and live only on the machine that ran them. Five of those directories (v3 to v7) are in the worktree `.worktrees/find-cause-success`. This file is the record.

## Check on value-export-mismatch

- Task `value-export-mismatch`, a second value task, run from the branch `feat/find-cause-success` (tip `9197f14f`, the v7 find-cause text). Purpose: see whether the test-pollution result (exo never passed) holds on another task.
- Result: baseline passed 5 of 5, exo passed 4 of 5. Cost per cell: exo $0.17 against baseline $0.15.
- exo run 3 took 745s, the slow outlier.
- n=5 per arm: 4 of 5 against 5 of 5 is one cell, not a difference.
- Decision: the work on this branch (review point 1, and low-priority point L) is dropped. The branch `feat/find-cause-success` and its worktree are deleted after this commit lands, so the v3 to v7 plugin commits (`b2880b29` to `9197f14f`) are no longer on any branch, and the raw cells of the runs v3 to v7 kept in that worktree are gone. This section and the tables above are the only record.
