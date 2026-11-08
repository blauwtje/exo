Baseline rerun at 165fafde: fix rate 0.825 (below 0.889), cost 10.18 USD, errored runs 0.

| fixture | baseline 2026-10-26 | rerun 165fafde | replay 1 (main) | replay 2 (narrow) |
|---|---|---|---|---|
| copied-block | 0.33 | 0.50 | 1.00 | 0.67 |
| dead-code | 1.00 | 0.78 | 0.78 | 0.78 |
| duplicate-truth-source | 0.50 | 1.00 | 0.50 | 0.33 |
| narrating-comment | 1.00 | 1.00 | none | 1.00 |
| swallowed-failure | 1.00 | 1.00 | 0.78 | 1.00 |
| two-rounds | 0.50 | 0.50 | 0.17 | 0.50 |
| untested-branch | 1.00 | 1.00 | 0.50 | 0.00 |
| fix rate | 0.889 | 0.825 | 0.620 | 0.611 |

Score (rounds to clean, never clean = 4): rerun 2.62 (sd 0.62) vs 2.381 baseline, 2.524 replay 1, 2.619 replay 2. Cost 10.18 vs 9.38, 10.15, 10.31 USD. False fix lines 0. Rerun dead-code 0.78 and duplicate-truth-source 1.00.
Grader: 165fafde's own harness (no --full, no --dry-run), so the rerun reproduces the 2026-10-26 baseline measurement; replays 1 and 2 used main's harness, 7 commits later including b6132dee (repair grading).
Command: node benchmarks/review-replay.mjs --task copied-block --task dead-code --task duplicate-truth-source --task narrating-comment --task swallowed-failure --task two-rounds --task untested-branch --repeat 3 --rounds 3 --budget-usd 15 --out .exo/gate-cost/rr-base.md (from .worktrees/review-baseline-165fafde)
Raw: .exo/gate-cost/rr-base.md.runs
Verdict: mostly noise or drift plus harness change, not clearly fix 3. The unchanged baseline fell from 0.889 to 0.825 on rerun, and single fixtures swing by 0.5 or more (duplicate-truth-source 0.50 to 1.00, copied-block 0.33 to 0.50), so a drop of 0.2 is within spread; the rerun lands between 0.62 and 0.889, so this run cannot tell fix 3 from the harness change.
