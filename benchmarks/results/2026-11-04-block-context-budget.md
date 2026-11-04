# Block context budget: fit of task-runner peak context

Tested on 2026-11-04 as a $0 offline replay of recorded real-use transcripts. No model call. Scripts and raw rows are local and untracked under `.exo/block-budget/` (find.mjs, collect.mjs, fit.mjs, guard.mjs, rows.json).

## Data
- 369 real-use `exo:run-unit` and `exo:task-runner` subagent transcripts (no tmp or sweep projects). 287 replay: the dispatch prompt names a plan that parses and a task list (or `LANDED <n>` lines), and the plan is on disk or in git history. 77 name a plan gone from disk and git, 5 other.
- Features come from the plan as on disk today (281) or from git at the run date (6), so a plan edited after its run adds noise.
- Fit set: blocks of at most 8 tasks (the cap `nextBlock` keeps). Window from 2026-10-09: 223 blocks in 93 sessions, peak mean 27.1k, median 23.0k, max 83.3k, 11 over 60k. Full corpus: 272 blocks in 108 sessions, max 83.3k, 13 over 60k.
- Runner model: Sonnet in 276 of 287 rows, Opus 3, deepseek 2. The fit is a Sonnet fit.
- `taskSize` lines are 0 in every replayed block (every plan is compact, no pasted code), and every task has exactly one proof, so lines and proof count carry nothing beyond the task count. Files per task and wave width (most tasks at one dependency depth inside the block) carry the signal.

## Fit: peak = intercept + per-term growth, leave-one-session-out CV (window)
| model | coefficients | R2 | cvR2 | cvRMSE | cvAUC >60k |
|---|---|---|---|---|---|
| count | 14419 + 2673/task | 0.227 | 0.194 | 13265 | 0.632 |
| count+files | 14494 + 2530/task + 33/file | 0.227 | 0.168 | 13473 | 0.635 |
| count+section chars | 14370 + 2863/task - 308/kchar | 0.227 | 0.165 | 13495 | 0.625 |
| count+wave | 12896 + 1948/task + 2306/lane | 0.267 | 0.228 | 12981 | 0.690 |
| count+files+wave (chosen) | 12837 + 558/task + 253/file + 3257/lane | 0.287 | 0.227 | 12984 | 0.739 |
| files+wave | 13305 + 323/file + 3683/lane | 0.285 | 0.249 | 12804 | 0.770 |

Full corpus, same order of models: count cvR2 0.221 AUC 0.650; count+wave 0.257 / 0.720; count+files+wave 0.266 / 0.755; files+wave 0.270 / 0.769.

Verdict on step 1: the task features separate heavy blocks from light ones better than count alone (cvAUC for a peak over 60k 0.63 to 0.74, full corpus 0.65 to 0.76), but the predictor stays weak: about 75% of peak variance is in-run behaviour (reads, repairs, retries) that no pre-dispatch feature sees, and cvRMSE only falls from 13.3k to 13.0k. The chosen model keeps the brief's shape (startup intercept plus per-task growth) and adds per-file and per-lane growth.

## Guard: blocks the budget would split (replay of the real blocks through the budgeted cut)
Fixed cost per extra block $0.23 (from `benchmarks/results/2026-10-20-block-cap-16.md`).

| budget | window blocks split | extra blocks | cost | observed peaks over budget caught |
|---|---|---|---|---|
| 50000 | 4 of 258 (1.6%) | 4 | $0.92 | 2 of 19 |
| 60000 | 0 of 258 | 0 | $0.00 | 0 of 11 |
| 70000 | 0 of 258 | 0 | $0.00 | 0 of 5 |
| 80000 | 0 of 258 | 0 | $0.00 | 0 of 1 |

Full corpus: same pattern (50k splits 5 of 309, $1.15; 60k and above split none). The highest predicted peak of any real block is 53.2k (53.5k full corpus).

At the chosen budgets (opus 80000, sonnet 80000, haiku 60000) the cut splits 0% of real blocks, so the cost change is $0 and 0% of run, under the 1% limit. It also catches none of the observed overruns: it binds only on blocks wider or with more files than any recorded plan, so it guards against out-of-range plans, not against the 78k-83k peaks seen today. The budgets are chosen values, not measured context-rot thresholds.

## Where the unexplained context comes from
Context growth in each replayed runner transcript is attributed to the tool calls of the turn before it, split evenly over the calls of that turn. Shares are of all added tokens in the 32 window blocks whose peak sits more than 10k above the prediction (all 223 blocks in brackets).

1. Bash waits and background task output (polling a build, test output, git calls): 36.9% (28.1%).
2. Landing output, the `land-slot` and `land-task` report with its chained next-task text: 25.1% (27.8%).
3. Build-task returns: 12.5% (13.8%).

Then come next-task output at 8.7% (14.2%), repair dispatches and SendMessage corrections at 7.7% (8.5%), refused landings at 4.4% (3.5%) and file reads at 4.1% (3.9%). All of these depend on what happens during the run, not on the plan text, so no pre-dispatch feature sees them.

## Verdict
Rejected, no branch. The fit reaches only R2 0.227. Observed peaks reach 83k in the replayed blocks (107k in the 2026-10-20 full corpus), but the prediction never goes above 53.2k. A pre-dispatch cut from plan features therefore misses the heavy blocks, and at the chosen budgets it would add a mechanism that never fires. Spent: $0.00.
