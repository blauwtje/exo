# Subscription usage breakdown, 2026-10-19 to 2026-11-02

This page records where the subscription went in one window and which cut follows from it. Weight is the API list price in USD of each priced Claude call, not a charge. The base is every priced Claude call on a subscription-billed session. Every percentage is of the base unless a column says otherwise.

## Totals

- Window: 2026-10-19 to 2026-11-02, 15 local days (the last day is partial).
- Base: USD 3870.09 over 178540 calls and 16637 sessions.
- API-key sessions, priced Claude calls: USD 137.72 (3.56% of the base), kept out of the base.
- Left out of the base because they have no Claude price: `<synthetic>` (114 calls), `claude-haiku-5-5` (23973 calls) and `deepseek-flash` (1248 calls). Priced at `claude-haiku-4-5` rates, the subscription `claude-haiku-5-5` calls would add USD 69.00 (1.78% of the base).

## Origin

| bucket | USD | % of base | calls | sessions |
|---|---|---|---|---|
| interactive | 2575.54 | 66.55 | 95800 | 846 |
| benchmark | 1294.55 | 33.45 | 82740 | 15791 |
| headless `exo run` | 0.00 | 0.00 | 0 | 0 |

Interactive splits into the human session (USD 2435.42, 62.93%, 413 sessions) and headless sessions started inside a repository (USD 140.12, 3.62%, 433 sessions).

The largest benchmark sources:

| benchmark source | USD | % of base | calls | sessions |
|---|---|---|---|---|
| sweep cells | 470.42 | 12.16 | 45289 | 723 |
| adhd cells | 196.64 | 5.08 | 8032 | 8032 |
| review-replay | 184.42 | 4.77 | 12201 | 1567 |
| ideas work cells | 101.54 | 2.62 | 2360 | 346 |
| pair judges | 65.81 | 1.70 | 655 | 313 |
| ideas judges | 34.02 | 0.88 | 2707 | 2707 |

## Main thread and subagents

| row | USD | % of base | calls | sessions |
|---|---|---|---|---|
| all subagents | 2181.33 | 56.36 | 117879 | 2796 |
| interactive subagents | 1689.73 | 43.66 | 73277 | 316 |
| all main threads | 1688.76 | 43.64 | 60661 | 16635 |
| benchmark main threads | 813.51 | 21.02 | 38367 | 15789 |
| interactive main threads | 745.69 | 19.27 | 20348 | 413 |
| benchmark subagents | 481.04 | 12.43 | 44373 | 2465 |

The largest subagent types are `general-purpose` (USD 1166.72, 30.15%), `review-branch` (9.27%), `build-task` (8.53%) and `task-runner` (USD 119.72, 3.09%).

## Token class

| class | USD | % of base | tokens | % of tokens |
|---|---|---|---|---|
| output | 1334.33 | 34.48 | 89780453 | 1.58 |
| cache write, 1 hour | 933.89 | 24.13 | 154083912 | 2.71 |
| cache write, 5 minutes | 801.04 | 20.70 | 226315631 | 3.99 |
| cache read | 799.80 | 20.67 | 5206486696 | 91.71 |
| input | 1.03 | 0.03 | 367080 | 0.01 |

Main threads write almost only at 1 hour (USD 864.88, 51.21% of main-thread weight). Subagents write almost only at 5 minutes (USD 800.98, 36.72% of subagent weight). Benchmark main threads write 99.9% of their cache tokens at the 1-hour rate.

## The cut

Benchmark-started sessions switch to the 5-minute cache. Repricing every 1-hour write of the benchmark main threads (USD 203.57, 5.26% of the base) and of the benchmark `task-runner` threads (USD 19.40, 0.50%) at the 5-minute rate saves USD 222.97 of USD 3870.09, which is 5.76%.

- Only 13 of 35763 benchmark main-thread calls and 0 `task-runner` calls follow an idle gap between 5 minutes and 1 hour, so almost nothing writes again.
- The 5.76% is an upper bound: it holds only if every benchmark launcher takes the 5-minute cache. A launcher that stays at 1 hour keeps its share of the 1-hour writes.
- The model and effort of every agent stay as they are.

## Why interactive stays at 1 hour

Repricing the 413 interactive main threads at 5 minutes would cost 3.30% more of the base (USD 127.74), because 658 calls follow an idle gap of 5 to 60 minutes and would write their context again instead of reading it. Headless `exo run` already runs at 5 minutes.

## Comparing cost across the change

A cost comparison across the commit that lands the cut reruns its base arm. A stored baseline measured at the 1-hour cache does not pair with a 5-minute run.

## Check one week later

Rerun `gaps.mjs` one week after the change lands. The 1-hour share of benchmark main-thread cache writes must fall from 99.9% toward 0. The effect of the two cache variables on a subscription session cannot be read from this repository, so that rerun is the check.
