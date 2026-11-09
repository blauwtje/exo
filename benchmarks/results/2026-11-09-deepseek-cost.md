# DeepSeek Flash cost figure: exo before and after the fix

Change: on a `deepseek*` model the sweep record `costUsd` is computed from usage counts at the Flash list price (hit 0.003, miss 0.15, output 0.60 USD per 1M tokens off-peak, 2x at peak by the cell's start time) instead of Claude Code's `total_cost_usd`, which prices `deepseek-flash` at an Opus rate. Sweep records also carry `cacheHitTokens` and `cacheMissTokens`.

Command: `node benchmarks/replay-deepseek-cost.mjs .exo/kept/deepseek-flash/deepseek-flash/sweep`, 40 kept runs (build-low 15, build-high 15, flow-low 10), each priced from `stdout.json` modelUsage. Baseline for before: the old `total_cost_usd` sum of the same 40 files. No new DeepSeek run was made.

| figure | USD |
|---|---|
| exo before (sum of `total_cost_usd`) | 24.27 |
| exo after, peak start (2026-11-09 09:00 UTC) | 0.999 |
| exo after, off-peak start | 0.499 |
| ground truth, 40-run sweep at peak rate | 0.999 |
| dashboard, 234 requests, 3,552,979 tokens, 2026-11-09 (earlier in the run) | 0.44 |

Before is 24x the ground truth; after is within 0% of the sweep ground truth at peak. The dashboard $0.44 covers an earlier part of the run than the 40 kept records, so it is a lower bound, not a like-for-like total.

Proof: `tests/benchmark-deepseek-cost.test.mjs` and `tests/benchmark-cell-usage.test.mjs`.

Not done: the end-of-run line of `skills/build/scripts/run-plan-finish.mjs` is unchanged; run records carry no separate miss count, only cache read and write.
