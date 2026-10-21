# exo value benchmark: plain Claude Code against exo, five bug-fix tasks

Measured hidden-test passes, cost and tokens for `baseline` (Claude Code without a plugin) and `exo` in one batch on the five bug-fix tasks of the earlier head-to-head (`value-rename-propagation`, `value-add-field-migration`, `value-context-guards`, `value-test-pollution`, `value-export-mismatch`; fixtures in `benchmarks/value/`). Sonnet 5.5 (`claude-sonnet-5-5`) at the CLI's default effort, Claude Code 2.1.306, fixture `full-stack-fastapi-template@cd83fc1`, 5 runs per task and arm, 50 cells, plugin commit `f2ed5400`, 2026-10-21.

```bash
node benchmarks/run.mjs --tasks value-rename-propagation,value-add-field-migration,value-context-guards,value-test-pollution,value-export-mismatch --arms baseline,exo --model sonnet --runs 5 --concurrency 2 --max-total-usd 8.0 --out benchmarks/runs/2026-10-21-h2h-baseline-exo
```

Pass is the hidden check of `node benchmarks/score.mjs <dir>`. `Cost` is `total_cost_usd`. `Tokens` is weighted input plus output, as `score.mjs` weights them. The exo tasks were also used while tuning exo, so this is not a held-out set.

## Results

| Task | baseline pass | exo pass | baseline cost / cell | exo cost / cell |
|---|---|---|---|---|
| value-rename-propagation | 5/5 | 5/5 | $0.120 | $0.154 |
| value-add-field-migration | 5/5 | 5/5 | $0.1232 | $0.1994 |
| value-context-guards | 5/5 | 5/5 | $0.1158 | $0.1302 |
| value-test-pollution | 0/5 | 2/5 | $0.0609 | $0.117 |
| value-export-mismatch | 3/5 | 3/5 | $0.096 | $0.112 |
| **total** | **18/25** | **20/25** | **$0.1032** | **$0.1424** |

exo passed 2 more of 25 hidden checks (80% against 72%), all on `value-test-pollution`. The difference is about 0.7 standard errors, so this batch does not separate the arms on pass rate. exo cost 38% more per cell ($3.560 against $2.580 for 25 cells), used 33% more weighted tokens (67.0k against 50.2k per cell) and 49% more output tokens (4,034 against 2,711 per cell). `score.mjs` overhead line: R 1.35, Q +2 (limit +3).

## Two cells did not run

In `value-export-mismatch`, `baseline` run 4 and `exo` run 3 ended after 5-6 seconds with `Failed to authenticate. API Error: 401 OAuth access token has expired`, cost $0 and no edits. `score.mjs` counted them as failed cells and printed `errors 0`. Without them the totals are baseline 18/24 and exo 20/24. They were not rerun.

## Earlier run

`2026-10-20-h2h-t4` (not in this folder) ran exo against a rival workflow plugin in the same five tasks: exo 22/25, rival 17/25, $0.1496 and $0.1090 per cell. Here plain Claude Code scored 18/25, close to that rival, and exo 20/25.

## Raw score output

```
value tier · model claude-sonnet-5-5 · Claude Code 2.1.306 (Claude Code) · 2026-10-21 · mean ±standard error

| task | arm | n | errors | pass | defects | LOC added | tokens | cost | wall time | cost / success |
|---|---|---|---|---|---|---|---|---|---|---|
| value-add-field-migration | baseline | 5 | 0 | 100% ±0% | 0.0 ±0.0 | 19 ±1 | 61k ±3.6k | $0.1232 ±$0.0056 | 0.7m ±0.1m | $0.12 |
| value-add-field-migration | exo | 5 | 0 | 100% ±0% | 0.0 ±0.0 | 21 ±2 | 93k ±3.2k | $0.1994 ±$0.0081 | 1.1m ±0.1m | $0.20 |
| value-context-guards | baseline | 5 | 0 | 100% ±0% | 0.0 ±0.0 | 22 ±3 | 57k ±2.7k | $0.1158 ±$0.0036 | 0.6m ±0.0m | $0.12 |
| value-context-guards | exo | 5 | 0 | 100% ±0% | 0.0 ±0.0 | 27 ±1 | 60k ±1.4k | $0.1302 ±$0.0033 | 0.7m ±0.0m | $0.13 |
| value-export-mismatch | baseline | 5 | 0 | 60% ±24% | 1.4 ±1.2 | 9 ±2 | 46k ±12k | $0.096 ±$0.026 | 0.6m ±0.1m | $0.16 |
| value-export-mismatch | exo | 5 | 0 | 60% ±24% | 2.0 ±1.3 | 10 ±3 | 53k ±14k | $0.112 ±$0.031 | 0.8m ±0.2m | $0.19 |
| value-rename-propagation | baseline | 5 | 0 | 100% ±0% | 0.0 ±0.0 | 35 ±0 | 57k ±5.8k | $0.120 ±$0.010 | 0.7m ±0.1m | $0.12 |
| value-rename-propagation | exo | 5 | 0 | 100% ±0% | 0.0 ±0.0 | 35 ±0 | 75k ±3.4k | $0.1540 ±$0.0057 | 1.0m ±0.1m | $0.15 |
| value-test-pollution | baseline | 5 | 0 | 0% ±0% | 10.0 ±0.0 | 1 ±0 | 30k ±2.6k | $0.0609 ±$0.0043 | 0.4m ±0.1m | none |
| value-test-pollution | exo | 5 | 0 | 40% ±24% | 4.8 ±2.2 | 5 ±3 | 55k ±4.2k | $0.117 ±$0.011 | 0.6m ±0.1m | $0.29 |

overhead exo vs baseline · R 1.35 (value-add-field-migration 1.62, value-context-guards 1.12, value-rename-propagation 1.29) pass (limit 1.35) · Q +2 (20 vs 18 hidden passes over 5 tasks) fail (limit +3)
```
