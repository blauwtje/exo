# Cut matrix: the four cut arms and two scan arms against the baseline and full exo

This file scores the paid run of `docs/specs/measure-then-cut.md`, 140 cells in three tiers. Every cell ran Sonnet 5 (`claude-sonnet-5`) on Claude Code 2.1.292. The template and hard tiers ran at the CLI's default effort and the flow tier at high.

- **Template tier**, run `2026-10-07-cut-template`: tasks `tmpl-be-recent`, `tmpl-be-rename`, `tmpl-fe-copy` and `tmpl-fe-stepper`; arms `baseline`, `exo` and `exo-pointer`; 5 runs each, 60 cells. A cell passes when its correctness gate passes (`correct` in `checks.json`).
- **Hard tier**, run `2026-10-07-cut-hard`: tasks `value-test-pollution` and `value-context-guards`; arms `baseline`, `exo`, `exo-pointer`, `exo-no-find-cause`, `exo-log-scan` and `exo-sibling-scan`; 5 runs each, 60 cells. A cell passes when the task's hidden `check.mjs` finds no defect (`pass` in `checks.json`).
- **Flow tier**, runs `2026-10-07-cut-flow-v100-r1` to `-r5`: cells `flow-base`, `flow-c7`, `flow-session` and `flow-session-no-proof`, one per round, 20 cells. A cell passes when `benchmarks/flow-check.mjs` passes (`hiddenPass` in `record.json`).

## Versions

The template and hard tiers measured exo 0.99.0 (5b33c65e). The flow tier measured exo 0.100.0 (3cbb88e0). The flow numbers are therefore not compared with the other two tiers.

Rounds 4 and 5 of the flow tier ran from a worktree pinned at 3cbb88e0, because `main` moved during round 3. Rounds 1 to 3 ran from the main checkout. All of their cells started before the move or ran from plugin copies made before it.

## Method

- Every cell counts in every figure. No cell timed out, and every cell has its `checks.json` or `record.json`, its `result.json` where the tier writes one, and its `usage.json`.
- Weighted tokens are weighted input plus output from `usage.json`, summed over the main thread and every subagent. The flow tier's `record.json` `tokens` equals that sum.
- Cost is `total_cost_usd` from `result.json`, or `costUsd` from `record.json` in the flow tier. Wall time is `wallMs` from `checks.json` or `record.json`.
- Cost per success is the spend of every cell, failed and timed-out cells included, divided by the passing cells. It reads `none` when no cell passes.
- Each mean carries its sample standard deviation (SD), from `meanAndSd` in `benchmarks/statistics.mjs`. A row over all tasks pools the arm's cells of every task, so its SD also holds the spread between tasks.
- A difference is marked **beyond** when its size exceeds 2 standard errors (SE), and `within` otherwise. A pass-rate difference takes the binomial SE of the difference, √(p₁(1−p₁)/n₁ + p₂(1−p₂)/n₂). A difference of means takes √(s₁²/n₁ + s₂²/n₂), with s the sample SD. Two arms that both pass every cell, or both pass none, have a pass-rate SE of 0.
- Cost per success has no SE, so its difference carries no mark.
- Each tier compares every arm with its baseline arm, `baseline` for template and hard and `flow-base` for flow. Each cut arm is also compared with full exo, `exo` for template and hard and `flow-c7` for flow, because the verdict rests on that comparison.

`/tmp/exo-cut-matrix/compute.mjs` computed every table. `node benchmarks/score.mjs` on the two run folders and `node benchmarks/flow-report.mjs` on the five flow rounds print the same pass counts, token and cost means and cost per success. The one figure that differs is template wall time: `score.mjs` reports `duration_ms` from `result.json`, about 0.7 to 0.9 minutes per arm, where this file reports `wallMs`, the harness's own clock around the whole cell.

## Results

### Template tier: per arm

| task | arm | runs | pass rate | mean weighted tokens ±SD | mean cost ±SD | mean wall time ±SD | cost per success |
|---|---|---|---|---|---|---|---|
| tmpl-be-recent | baseline | 5 | 100% (5/5) | 125.6k ±23.7k | $0.312 ±0.059 | 1.7 min ±0.3 | $0.312 |
| tmpl-be-recent | exo | 5 | 100% (5/5) | 160.1k ±44.9k | $0.392 ±0.092 | 2.0 min ±0.3 | $0.392 |
| tmpl-be-recent | exo-pointer | 5 | 100% (5/5) | 121.9k ±17.0k | $0.289 ±0.044 | 1.6 min ±0.3 | $0.289 |
| tmpl-be-rename | baseline | 5 | 100% (5/5) | 105.4k ±12.5k | $0.269 ±0.037 | 1.4 min ±0.3 | $0.269 |
| tmpl-be-rename | exo | 5 | 100% (5/5) | 123.7k ±22.7k | $0.302 ±0.046 | 1.4 min ±0.1 | $0.302 |
| tmpl-be-rename | exo-pointer | 5 | 100% (5/5) | 107.6k ±9.6k | $0.271 ±0.032 | 1.4 min ±0.3 | $0.271 |
| tmpl-fe-copy | baseline | 5 | 100% (5/5) | 113.4k ±31.8k | $0.301 ±0.093 | 1.7 min ±0.6 | $0.301 |
| tmpl-fe-copy | exo | 5 | 100% (5/5) | 114.7k ±19.7k | $0.299 ±0.058 | 1.7 min ±0.5 | $0.299 |
| tmpl-fe-copy | exo-pointer | 5 | 100% (5/5) | 99.8k ±28.1k | $0.254 ±0.077 | 1.4 min ±0.5 | $0.254 |
| tmpl-fe-stepper | baseline | 5 | 100% (5/5) | 91.6k ±9.0k | $0.241 ±0.032 | 1.4 min ±0.3 | $0.241 |
| tmpl-fe-stepper | exo | 5 | 100% (5/5) | 133.5k ±121.1k | $0.319 ±0.275 | 1.5 min ±1.1 | $0.319 |
| tmpl-fe-stepper | exo-pointer | 5 | 100% (5/5) | 105.1k ±14.8k | $0.277 ±0.053 | 1.5 min ±0.6 | $0.277 |
| **all tasks** | baseline | 20 | 100% (20/20) | 109.0k ±23.3k | $0.281 ±0.062 | 1.5 min ±0.4 | $0.281 |
| **all tasks** | exo | 20 | 100% (20/20) | 133.0k ±63.3k | $0.328 ±0.143 | 1.6 min ±0.6 | $0.328 |
| **all tasks** | exo-pointer | 20 | 100% (20/20) | 108.6k ±19.1k | $0.273 ±0.051 | 1.4 min ±0.4 | $0.273 |

### Template tier: against baseline

| task | arm | pass rate − baseline | tokens − baseline | cost − baseline | wall − baseline | cost per success − baseline (no SE, no mark) |
|---|---|---|---|---|---|---|
| tmpl-be-recent | exo | +0 pts (SE 0) within | +34.5k (SE 22.7k) within | +$0.080 (SE $0.049) within | +0.3 min (SE 0.2) within | +$0.080 |
| tmpl-be-recent | exo-pointer | +0 pts (SE 0) within | -3.7k (SE 13.1k) within | -$0.022 (SE $0.033) within | -0.1 min (SE 0.2) within | -$0.022 |
| tmpl-be-rename | exo | +0 pts (SE 0) within | +18.3k (SE 11.6k) within | +$0.033 (SE $0.026) within | +0.0 min (SE 0.1) within | +$0.033 |
| tmpl-be-rename | exo-pointer | +0 pts (SE 0) within | +2.2k (SE 7.0k) within | +$0.002 (SE $0.022) within | -0.0 min (SE 0.2) within | +$0.002 |
| tmpl-fe-copy | exo | +0 pts (SE 0) within | +1.3k (SE 16.7k) within | -$0.002 (SE $0.049) within | -0.1 min (SE 0.3) within | -$0.002 |
| tmpl-fe-copy | exo-pointer | +0 pts (SE 0) within | -13.6k (SE 19.0k) within | -$0.047 (SE $0.054) within | -0.4 min (SE 0.3) within | -$0.047 |
| tmpl-fe-stepper | exo | +0 pts (SE 0) within | +41.9k (SE 54.3k) within | +$0.078 (SE $0.124) within | +0.1 min (SE 0.5) within | +$0.078 |
| tmpl-fe-stepper | exo-pointer | +0 pts (SE 0) within | +13.5k (SE 7.7k) within | +$0.036 (SE $0.028) within | +0.1 min (SE 0.3) within | +$0.036 |
| **all tasks** | exo | +0 pts (SE 0) within | +24.0k (SE 15.1k) within | +$0.047 (SE $0.035) within | +0.1 min (SE 0.2) within | +$0.047 |
| **all tasks** | exo-pointer | +0 pts (SE 0) within | -0.4k (SE 6.7k) within | -$0.008 (SE $0.018) within | -0.1 min (SE 0.1) within | -$0.008 |

### Template tier: cut arms against exo

| task | arm | pass rate − exo | tokens − exo | cost − exo | wall − exo | cost per success − exo (no SE, no mark) |
|---|---|---|---|---|---|---|
| tmpl-be-recent | exo-pointer | +0 pts (SE 0) within | -38.2k (SE 21.5k) within | -$0.103 (SE $0.046) **beyond** | -0.5 min (SE 0.2) **beyond** | -$0.103 |
| tmpl-be-rename | exo-pointer | +0 pts (SE 0) within | -16.1k (SE 11.0k) within | -$0.031 (SE $0.025) within | -0.0 min (SE 0.1) within | -$0.031 |
| tmpl-fe-copy | exo-pointer | +0 pts (SE 0) within | -14.8k (SE 15.3k) within | -$0.045 (SE $0.043) within | -0.3 min (SE 0.3) within | -$0.045 |
| tmpl-fe-stepper | exo-pointer | +0 pts (SE 0) within | -28.4k (SE 54.5k) within | -$0.042 (SE $0.125) within | -0.0 min (SE 0.5) within | -$0.042 |
| **all tasks** | exo-pointer | +0 pts (SE 0) within | -24.4k (SE 14.8k) within | -$0.055 (SE $0.034) within | -0.2 min (SE 0.2) within | -$0.055 |

### Hard tier: per arm

| task | arm | runs | pass rate | mean weighted tokens ±SD | mean cost ±SD | mean wall time ±SD | cost per success |
|---|---|---|---|---|---|---|---|
| value-test-pollution | baseline | 5 | 0% (0/5) | 60.7k ±4.9k | $0.144 ±0.011 | 0.8 min ±0.2 | none |
| value-test-pollution | exo | 5 | 0% (0/5) | 85.4k ±9.1k | $0.207 ±0.022 | 1.3 min ±0.3 | none |
| value-test-pollution | exo-pointer | 5 | 0% (0/5) | 84.6k ±7.3k | $0.203 ±0.020 | 1.0 min ±0.3 | none |
| value-test-pollution | exo-no-find-cause | 5 | 0% (0/5) | 66.5k ±4.9k | $0.157 ±0.012 | 1.0 min ±0.1 | none |
| value-test-pollution | exo-log-scan | 5 | 0% (0/5) | 85.1k ±6.1k | $0.207 ±0.017 | 1.2 min ±0.2 | none |
| value-test-pollution | exo-sibling-scan | 5 | 0% (0/5) | 183.5k ±48.1k | $0.475 ±0.137 | 3.5 min ±1.4 | none |
| value-context-guards | baseline | 5 | 40% (2/5) | 151.7k ±34.6k | $0.380 ±0.090 | 2.4 min ±0.7 | $0.950 |
| value-context-guards | exo | 5 | 20% (1/5) | 204.1k ±64.6k | $0.522 ±0.182 | 3.5 min ±1.7 | $2.609 |
| value-context-guards | exo-pointer | 5 | 20% (1/5) | 199.6k ±114.0k | $0.505 ±0.306 | 3.3 min ±2.2 | $2.524 |
| value-context-guards | exo-no-find-cause | 5 | 40% (2/5) | 159.4k ±40.5k | $0.405 ±0.102 | 2.7 min ±0.5 | $1.012 |
| value-context-guards | exo-log-scan | 5 | 20% (1/5) | 248.3k ±124.6k | $0.648 ±0.332 | 4.5 min ±2.3 | $3.241 |
| value-context-guards | exo-sibling-scan | 5 | 0% (0/5) | 254.7k ±93.2k | $0.650 ±0.271 | 4.7 min ±2.6 | none |
| **all tasks** | baseline | 10 | 20% (2/10) | 106.2k ±53.3k | $0.262 ±0.138 | 1.6 min ±1.0 | $1.311 |
| **all tasks** | exo | 10 | 10% (1/10) | 144.8k ±76.2k | $0.364 ±0.206 | 2.4 min ±1.6 | $3.643 |
| **all tasks** | exo-pointer | 10 | 10% (1/10) | 142.1k ±97.3k | $0.354 ±0.259 | 2.2 min ±1.9 | $3.541 |
| **all tasks** | exo-no-find-cause | 10 | 20% (2/10) | 112.9k ±56.0k | $0.281 ±0.148 | 1.8 min ±0.9 | $1.404 |
| **all tasks** | exo-log-scan | 10 | 10% (1/10) | 166.7k ±119.6k | $0.427 ±0.321 | 2.8 min ±2.3 | $4.275 |
| **all tasks** | exo-sibling-scan | 10 | 0% (0/10) | 219.1k ±79.4k | $0.563 ±0.223 | 4.1 min ±2.1 | none |

### Hard tier: against baseline

| task | arm | pass rate − baseline | tokens − baseline | cost − baseline | wall − baseline | cost per success − baseline (no SE, no mark) |
|---|---|---|---|---|---|---|
| value-test-pollution | exo | +0 pts (SE 0) within | +24.7k (SE 4.6k) **beyond** | +$0.063 (SE $0.011) **beyond** | +0.5 min (SE 0.1) **beyond** | none |
| value-test-pollution | exo-pointer | +0 pts (SE 0) within | +23.9k (SE 3.9k) **beyond** | +$0.059 (SE $0.010) **beyond** | +0.3 min (SE 0.2) within | none |
| value-test-pollution | exo-no-find-cause | +0 pts (SE 0) within | +5.7k (SE 3.1k) within | +$0.012 (SE $0.007) within | +0.2 min (SE 0.1) **beyond** | none |
| value-test-pollution | exo-log-scan | +0 pts (SE 0) within | +24.4k (SE 3.5k) **beyond** | +$0.062 (SE $0.009) **beyond** | +0.4 min (SE 0.1) **beyond** | none |
| value-test-pollution | exo-sibling-scan | +0 pts (SE 0) within | +122.7k (SE 21.6k) **beyond** | +$0.331 (SE $0.061) **beyond** | +2.7 min (SE 0.6) **beyond** | none |
| value-context-guards | exo | -20 pts (SE 28) within | +52.4k (SE 32.8k) within | +$0.142 (SE $0.091) within | +1.1 min (SE 0.8) within | +$1.659 |
| value-context-guards | exo-pointer | -20 pts (SE 28) within | +47.9k (SE 53.3k) within | +$0.125 (SE $0.143) within | +0.9 min (SE 1.0) within | +$1.574 |
| value-context-guards | exo-no-find-cause | +0 pts (SE 31) within | +7.6k (SE 23.8k) within | +$0.025 (SE $0.061) within | +0.2 min (SE 0.4) within | +$0.062 |
| value-context-guards | exo-log-scan | -20 pts (SE 28) within | +96.6k (SE 57.8k) within | +$0.268 (SE $0.154) within | +2.1 min (SE 1.1) within | +$2.291 |
| value-context-guards | exo-sibling-scan | -40 pts (SE 22) within | +103.0k (SE 44.5k) **beyond** | +$0.270 (SE $0.128) **beyond** | +2.2 min (SE 1.2) within | none |
| **all tasks** | exo | -10 pts (SE 16) within | +38.5k (SE 29.4k) within | +$0.102 (SE $0.078) within | +0.8 min (SE 0.6) within | +$2.333 |
| **all tasks** | exo-pointer | -10 pts (SE 16) within | +35.9k (SE 35.1k) within | +$0.092 (SE $0.093) within | +0.6 min (SE 0.7) within | +$2.231 |
| **all tasks** | exo-no-find-cause | +0 pts (SE 18) within | +6.7k (SE 24.4k) within | +$0.019 (SE $0.064) within | +0.2 min (SE 0.4) within | +$0.093 |
| **all tasks** | exo-log-scan | -10 pts (SE 16) within | +60.5k (SE 41.4k) within | +$0.165 (SE $0.111) within | +1.2 min (SE 0.8) within | +$2.964 |
| **all tasks** | exo-sibling-scan | -20 pts (SE 13) within | +112.9k (SE 30.2k) **beyond** | +$0.301 (SE $0.083) **beyond** | +2.5 min (SE 0.7) **beyond** | none |

### Hard tier: cut arms against exo

| task | arm | pass rate − exo | tokens − exo | cost − exo | wall − exo | cost per success − exo (no SE, no mark) |
|---|---|---|---|---|---|---|
| value-test-pollution | exo-pointer | +0 pts (SE 0) within | -0.8k (SE 5.2k) within | -$0.003 (SE $0.013) within | -0.2 min (SE 0.2) within | none |
| value-test-pollution | exo-no-find-cause | +0 pts (SE 0) within | -18.9k (SE 4.6k) **beyond** | -$0.050 (SE $0.011) **beyond** | -0.3 min (SE 0.1) **beyond** | none |
| value-test-pollution | exo-log-scan | +0 pts (SE 0) within | -0.3k (SE 4.9k) within | -$0.000 (SE $0.012) within | -0.1 min (SE 0.2) within | none |
| value-test-pollution | exo-sibling-scan | +0 pts (SE 0) within | +98.0k (SE 21.9k) **beyond** | +$0.268 (SE $0.062) **beyond** | +2.2 min (SE 0.6) **beyond** | none |
| value-context-guards | exo-pointer | +0 pts (SE 25) within | -4.5k (SE 58.6k) within | -$0.017 (SE $0.159) within | -0.2 min (SE 1.2) within | -$0.085 |
| value-context-guards | exo-no-find-cause | +20 pts (SE 28) within | -44.8k (SE 34.1k) within | -$0.117 (SE $0.093) within | -0.9 min (SE 0.8) within | -$1.597 |
| value-context-guards | exo-log-scan | +0 pts (SE 25) within | +44.1k (SE 62.8k) within | +$0.126 (SE $0.169) within | +1.0 min (SE 1.3) within | +$0.632 |
| value-context-guards | exo-sibling-scan | -20 pts (SE 18) within | +50.6k (SE 50.7k) within | +$0.129 (SE $0.146) within | +1.1 min (SE 1.4) within | none |
| **all tasks** | exo-pointer | +0 pts (SE 13) within | -2.7k (SE 39.1k) within | -$0.010 (SE $0.105) within | -0.2 min (SE 0.8) within | -$0.102 |
| **all tasks** | exo-no-find-cause | +10 pts (SE 16) within | -31.9k (SE 29.9k) within | -$0.084 (SE $0.080) within | -0.6 min (SE 0.6) within | -$2.240 |
| **all tasks** | exo-log-scan | +0 pts (SE 13) within | +21.9k (SE 44.9k) within | +$0.063 (SE $0.121) within | +0.4 min (SE 0.9) within | +$0.631 |
| **all tasks** | exo-sibling-scan | -10 pts (SE 9) within | +74.3k (SE 34.8k) **beyond** | +$0.198 (SE $0.096) **beyond** | +1.7 min (SE 0.8) within | none |

### Flow tier: per arm

| task | arm | runs | pass rate | mean weighted tokens ±SD | mean cost ±SD | mean wall time ±SD | cost per success |
|---|---|---|---|---|---|---|---|
| flow | flow-base | 5 | 100% (5/5) | 136.5k ±4.9k | $0.311 ±0.010 | 1.5 min ±0.1 | $0.311 |
| flow | flow-c7 | 5 | 100% (5/5) | 559.2k ±34.2k | $1.366 ±0.095 | 5.2 min ±0.9 | $1.366 |
| flow | flow-session | 5 | 80% (4/5) | 456.2k ±30.5k | $1.046 ±0.063 | 4.3 min ±0.8 | $1.308 |
| flow | flow-session-no-proof | 5 | 100% (5/5) | 423.5k ±28.5k | $0.979 ±0.061 | 8.3 min ±8.7 | $0.979 |

### Flow tier: against flow-base

| task | arm | pass rate − flow-base | tokens − flow-base | cost − flow-base | wall − flow-base | cost per success − flow-base (no SE, no mark) |
|---|---|---|---|---|---|---|
| flow | flow-c7 | +0 pts (SE 0) within | +422.7k (SE 15.5k) **beyond** | +$1.055 (SE $0.043) **beyond** | +3.7 min (SE 0.4) **beyond** | +$1.055 |
| flow | flow-session | -20 pts (SE 18) within | +319.7k (SE 13.8k) **beyond** | +$0.735 (SE $0.028) **beyond** | +2.8 min (SE 0.4) **beyond** | +$0.997 |
| flow | flow-session-no-proof | +0 pts (SE 0) within | +287.0k (SE 12.9k) **beyond** | +$0.667 (SE $0.028) **beyond** | +6.8 min (SE 3.9) within | +$0.667 |

### Flow tier: cut arms against flow-c7

| task | arm | pass rate − flow-c7 | tokens − flow-c7 | cost − flow-c7 | wall − flow-c7 | cost per success − flow-c7 (no SE, no mark) |
|---|---|---|---|---|---|---|
| flow | flow-session | -20 pts (SE 18) within | -103.0k (SE 20.5k) **beyond** | -$0.320 (SE $0.051) **beyond** | -0.9 min (SE 0.5) within | -$0.059 |
| flow | flow-session-no-proof | +0 pts (SE 0) within | -135.7k (SE 19.9k) **beyond** | -$0.388 (SE $0.050) **beyond** | +3.1 min (SE 3.9) within | -$0.388 |

### Flow phase split

| phase | flow-c7 | flow-session | flow-session-no-proof |
|---|---|---|---|
| setup | 123.2k (22.0%) | 138.6k (30.4%) | 141.6k (33.4%) |
| wave | 92.9k (16.6%) | 0.0k (0.0%) | 0.0k (0.0%) |
| subagents | 163.4k (29.2%) | 0.0k (0.0%) | 0.0k (0.0%) |
| landing | 84.7k (15.1%) | 137.5k (30.1%) | 135.2k (31.9%) |
| verify | 48.8k (8.7%) | 129.4k (28.4%) | 100.5k (23.7%) |
| retries | 0.0k (0.0%) | 0.0k (0.0%) | 0.0k (0.0%) |
| review | 32.7k (5.9%) | 41.7k (9.1%) | 38.4k (9.1%) |
| fix | 0.0k (0.0%) | 0.0k (0.0%) | 0.0k (0.0%) |
| other | 13.5k (2.4%) | 9.1k (2.0%) | 8.0k (1.9%) |
| total | 559.2k | 456.2k | 423.5k |

The flow phase split above is `buildPhases` from `benchmarks/build-phases.mjs`, run on each cell's transcript as its `usage.json` names it. Each figure is the mean over the 5 rounds, with its share of the arm's total. In every cell the phases sum to the cell's `record.json` tokens. The two one-session arms dispatch no `build-task` agent, so their `wave` and `subagents` phases are 0 and their lead's landing and verify turns carry the build work. No cell of the three arms drew a Stop-hook block, so `retries` is 0 throughout.

## Notes on single cells

- **flow-session-no-proof, round 3, wall time.** The cell took 1,432,672 ms (23.9 minutes) at normal tokens (394.5k) and cost ($0.93). That one cell lifts the arm's mean wall time to 8.3 minutes and its SD to 8.7 minutes. The other four cells took 4.1 to 4.8 minutes.
- **flow-session, round 2, counts as a failure.** Its `record.json` reads `0/4 tasks landed` and `hidden check fail` with the defect `branch missing`.

### Round 2 flow-session: did the session delete or rename `feat/text-helpers`?

**No.** The session did not delete or rename `feat/text-helpers`; the branch never existed.

- The review subagent's transcript is `agent-aefbb00d8fc71df14.jsonl`, under `~/.claude/projects/-private-var-folders-tv-clc4z5g11k7dqz71wkq3k9kh0000gn-T-exo-sweep-flow-session-ZjfPJB-repo/6d1e5636-27d4-4b55-b190-edd49ac5ea19/subagents/`. Its line 19 reads `fatal: ambiguous argument 'b615552..feat/text-helpers': unknown revision or path not in the working tree.`
- Its line 26 holds the `git branch -a` output, `On branch main ... * main`, with the four task commits on `main`.
- The lead's transcript has no `git branch -D`, `-m` or `checkout -b` call. The lead ran `start-run.mjs`, `land-task.mjs` four times and `verify.mjs`.

## Verdict

Each cut arm is judged against full exo on its tier's row over all tasks:

- **drop** when its pass rate is lower beyond 2 SE, or its mean weighted tokens or mean cost are higher beyond 2 SE;
- **ship** when its pass rate is not lower beyond 2 SE and its mean weighted tokens or mean cost are lower beyond 2 SE;
- **unclear** otherwise.

The scan arms, `exo-log-scan` and `exo-sibling-scan`, get no verdict. Their rows stay in the tables.

- `exo-pointer`, template tier: **unclear**. It passes 20/20 like `exo`. Its tokens are 24.4k lower (2 SE 29.6k) and its cost $0.055 lower (2 SE $0.068), both within 2 SE.
- `exo-pointer`, hard tier: **unclear**. It passes 1/10 like `exo`. Its tokens are 2.7k lower (2 SE 78.2k) and its cost $0.010 lower (2 SE $0.209), both within 2 SE.
- `exo-no-find-cause`, hard tier: **unclear**. It passes 2/10 against 1/10, 10 points higher (2 SE 32 points). Its tokens are 31.9k lower (2 SE 59.8k) and its cost $0.084 lower (2 SE $0.160), both within 2 SE.
- `flow-session`, flow tier: **ship**. It passes 4/5 against 5/5, 20 points lower, within 2 SE (36 points). Its tokens are 103.0k lower (2 SE 41.0k) and its cost $0.320 lower (2 SE $0.102), both beyond 2 SE. Its one failure is the round 2 cell above.
- `flow-session-no-proof`, flow tier: **ship**. It passes 5/5 like `flow-c7`. Its tokens are 135.7k lower (2 SE 39.9k) and its cost $0.388 lower (2 SE $0.101), both beyond 2 SE.
