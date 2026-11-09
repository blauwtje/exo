# DeepSeek Flash effort per kind (2026-11-09)

## Build, measured

Source: `.exo/deepseek-flash/sweep/build-low/*/record.json` and `.exo/deepseek-flash/sweep/build-high/*/record.json`, 15 cells each (5 tasks x 3 repeats).

| effort | pass | median wall | cost, peak rate (spend2.mjs method) |
|---|---|---|---|
| low | 15/15 | 30.3 s | $0.155 |
| high | 15/15 | 34.2 s | $0.237 |

Pass rates tie, so the cheaper effort wins: build runs at low. Cost is priced from each cell's `stdout.json` token usage, not `costUsd`, which is Claude-priced.

## Other kinds

Measured: build, build-task, review, review-branch, review-deep, hardest.
Unmeasured (research proposal, `.exo/research/deepseek-flash/answer.md`): lookup low, chore low, orchestrator low, fix-review high, doc-task low, task-runner low, judge low. Medium is not a DeepSeek level and maps to high.

## Sweep spend

40 cells cost $0.999 at peak rate by `.exo/deepseek-flash/spend2.mjs`. The DeepSeek dashboard read $0.44 for the earlier part of the day. The sweep was stopped early for the deadline and flow-low is partial.
