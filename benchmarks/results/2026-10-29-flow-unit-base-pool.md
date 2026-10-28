# Pooled flow-unit base arm for the foreground run-unit fix 0662ba68

Base arm at integration commit `0662ba68` (run-unit dispatches its builds in the foreground, the flow fixture plan names a goal-checking Success criterion, the sweep counts `<planId>/<n>` trailers): `node benchmarks/sweep.mjs --set flow --cells flow-unit --repeat 15 --concurrency 5 --confirm`, cell `flow-unit`, model `claude-sonnet-5-5`, effort `high`, Claude Code 2.1.312, n=15, total cost $11.31. Raw cells sit under `.exo/flow-speed/pool-runs/pool-head/`, which is git-ignored.

All 15 cells landed 4/4 tasks and passed the hidden check. The cost mean is $0.754 and the wall mean is 147.8 s. Wall is not served by the pool.

| run | wall s | cost $ | tokens | tokens excl. review+fix | hidden pass | landed |
|---|---|---|---|---|---|---|
| main-base-1 | 196.3 | 0.945 | 317692 | 235241 | 1 | 4/4 |
| main-base-2 | 104.6 | 0.652 | 245868 | 220635 | 1 | 4/4 |
| main-base-3 | 230.8 | 1.041 | 373093 | 294676 | 1 | 4/4 |
| main-base-4 | 116.8 | 0.632 | 220747 | 191757 | 1 | 4/4 |
| main-base-5 | 120.0 | 0.672 | 249836 | 221345 | 1 | 4/4 |
| main-base-6 | 124.5 | 0.627 | 231641 | 204576 | 1 | 4/4 |
| main-base-7 | 116.4 | 0.624 | 234492 | 211351 | 1 | 4/4 |
| main-base-8 | 103.9 | 0.608 | 231691 | 209132 | 1 | 4/4 |
| main-base-9 | 104.3 | 0.629 | 229924 | 202704 | 1 | 4/4 |
| main-base-10 | 190.0 | 0.858 | 306471 | 239932 | 1 | 4/4 |
| main-base-11 | 103.4 | 0.611 | 232329 | 211186 | 1 | 4/4 |
| main-base-12 | 99.8 | 0.605 | 232788 | 211335 | 1 | 4/4 |
| main-base-13 | 279.8 | 1.180 | 424936 | 310126 | 1 | 4/4 |
| main-base-14 | 107.8 | 0.632 | 227437 | 200169 | 1 | 4/4 |
| main-base-15 | 218.2 | 0.997 | 358377 | 274592 | 1 | 4/4 |
