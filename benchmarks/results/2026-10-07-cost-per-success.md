# Cost per success, kept runs rescored

Each table below is a past result with a new last column. Cost per success is the spend of every cell, failed and timed-out ones included, divided by the cells that pass; `none` when nothing passes. Spend is the sum of `total_cost_usd` over an arm's cells, except for the flow run, whose records are gone (see its section). The rescore is `node benchmarks/score.mjs <run folder>` on the run folders that survive in the main checkout's `benchmarks/runs/`. The value and flow rows use the pass rule of their own results file.

Left out: `2026-09-11-calibration.md` (no `usage.json`; its script is removed), and the sweep and pressure results of 2026-09-28, 2026-09-29 and 2026-10-02, whose cells never lived in `benchmarks/runs/`.

## Template tasks, Haiku 4.5, 96 cells

`2026-09-11.md` and `2026-09-11-all-transcripts.md`, run `2026-09-11-full`. A cell passes when its correctness gate passes.

| arm | passing | spend | mean cost, passing cells | cost per success |
|---|---|---|---|---|
| baseline | 48/48 | $8.06 | $0.17 | $0.168 |
| exo | 46/48 | $9.83 | $0.21 | $0.214 |

Per success, exo costs 27% more than the baseline, against 24% more on mean cell cost, because its two failed cells are paid for and pass nothing.

## Template tasks, Haiku 4.5, efficiency rerun, 96 cells

`2026-09-11-haiku.md`, run `2026-09-11-efficiency-haiku`.

| arm | passing | spend | mean cost, passing cells | cost per success |
|---|---|---|---|---|
| baseline | 48/48 | $8.29 | $0.17 | $0.173 |
| exo | 48/48 | $7.61 | $0.16 | $0.159 |

Per success, exo costs 8% less than the baseline.

## Template tasks, Sonnet 5, rival arm, 36 cells

`2026-10-06-rivals.md`, run `2026-10-06-rivals`.

| arm | passing | spend | mean cost, passing cells | cost per success |
|---|---|---|---|---|
| baseline | 12/12 | $1.54 | $0.13 | $0.128 |
| exo | 12/12 | $1.73 | $0.14 | $0.144 |
| ponytail | 12/12 | $1.57 | $0.13 | $0.131 |

Per success, exo costs 13% more than the baseline and ponytail 2% more.

## Safe and git tiers, Sonnet 5, 42 cells

`2026-10-06-value.md`, run `2026-10-06-value`. A cell passes when it is `safe` (safe tier) or `SAFE_HELD` (git tier). `score.mjs` prints `none` for this run, because it counts only template cells, so these figures come from `checks.json` and `result.json` directly and match the file's own totals ($1.61 and $1.95).

| arm | passing | spend | cost per success |
|---|---|---|---|
| baseline | 21/21 | $1.61 | $0.077 |
| exo | 21/21 | $1.95 | $0.093 |

Per success, exo costs 21% more than the baseline.

## Hard value tasks, Sonnet 5, 20 cells

`2026-10-06-value-hard.md`, run `2026-10-06-value-phase2`. A cell passes when the task's hidden `check.mjs` finds no defect.

| task | arm | passing | spend | cost per success |
|---|---|---|---|---|
| value-context-guards | baseline | 4/5 | $1.44 | $0.361 |
| value-context-guards | exo | 2/5 | $2.25 | $1.123 |
| value-test-pollution | baseline | 0/5 | $0.82 | none |
| value-test-pollution | exo | 0/5 | $0.85 | none |

On `value-context-guards`, exo's cost per success is 3.1 times the baseline's, against 1.55 times on mean cell cost alone, because it also passes fewer cells. On `value-test-pollution` neither arm passes, so the price of the task is the spend with no success to show for it.

## Flow, Sonnet 5, high effort, 10 cells

`2026-10-07-flow.md`. The run folders `benchmarks/runs/2026-10-07-flow-r1` to `-r5` went with the removed `flow-test` worktree, so these figures come from that file: spend by arm ($1.57 and $8.50) and the hidden-check pass count. A cell passes when `benchmarks/flow-check.mjs` finds no defect.

| arm | passing | spend | cost per success |
|---|---|---|---|
| flow-base | 5/5 | $1.57 | $0.314 |
| flow-c7 (exo) | 4/5 | $8.50 | $2.125 |

Per success, exo costs 6.8 times the baseline, against 5.4 times on mean cell cost, because the spend of its failed cell is counted.

## Reading across the tables

- Cost per success matters only where a cell fails: it moves exo's figure in the 2026-09-11 run (+27% against +24% on mean cost, with the failed cells' spend counted), on `value-context-guards` and in the flow run. Where every cell passes, it equals the mean cost per cell.
- exo has the lower cost per success in one table, the Haiku efficiency rerun (-8%). It has the higher in all the others.
