FAIL: fix rate 0.611 against threshold 0.889 (narrow-read variant, branch feat/review-narrow-reads dfad54ef).

| fixture | fix rate (n) | never clean |
|---|---|---|
| copied-block | 0.67 (3) | 2 |
| dead-code | 0.78 (3) | 2 |
| duplicate-truth-source | 0.33 (1) | 0 |
| narrating-comment | 1.00 (2) | 0 |
| swallowed-failure | 1.00 (2) | 0 |
| two-rounds | 0.50 (3) | 1 |
| untested-branch | 0.00 (1) | 1 |

dead-code 0.78 vs 1.00 (below); duplicate-truth-source 0.33 vs 0.50 (below). Score 2.619 (sd 0.803) vs 2.381; cost 10.31 vs 9.38 USD; false fix lines 0; errored runs 0. Replay 1 (c38b80c5) scored 0.620, so narrowing reads did not help.
Command: node benchmarks/review-replay.mjs --full --task copied-block --task dead-code --task duplicate-truth-source --task narrating-comment --task swallowed-failure --task two-rounds --task untested-branch --repeat 3 --rounds 3 --budget-usd 15 --out .exo/gate-cost/rr2.md (run from the worktree; the harness loads the plugin from its own checkout)
Raw: .exo/gate-cost/rr2.md.runs
