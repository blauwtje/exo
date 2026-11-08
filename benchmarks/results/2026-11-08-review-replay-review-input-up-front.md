| task | runs | skipped | failures | fixed after one repair | false fix lines | rounds to clean | never clean | cost usd |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| copied-block | 3 | 0 | 0 | 1.00 | 0.00 | - | 3 | 1.98 |
| dead-code | 3 | 0 | 0 | 0.78 ± 0.38 | 0.00 | 2.33 ± 0.58 | 0 | 1.61 |
| duplicate-truth-source | 3 | 0 | 0 | 0.50 (n=2) | 0.00 | 1.67 ± 0.58 | 0 | 1.02 |
| narrating-comment | 3 | 0 | 0 | - | - | 1.00 ± 0.00 | 0 | 0.43 |
| swallowed-failure | 3 | 0 | 0 | 0.78 ± 0.19 | 0.67 | 2.33 ± 0.58 | 0 | 1.49 |
| two-rounds | 3 | 0 | 0 | 0.17 ± 0.29 | 0.00 | 3.00 (n=1) | 2 | 2.16 |
| untested-branch | 3 | 0 | 0 | 0.50 (n=2) | 0.00 | 2.00 (n=2) | 1 | 1.47 |

Command: node benchmarks/review-replay.mjs --full --task copied-block --task dead-code --task duplicate-truth-source --task narrating-comment --task swallowed-failure --task two-rounds --task untested-branch --repeat 3 --rounds 3 --budget-usd 15 --out .exo/gate-cost/rr.md

Run records: .exo/gate-cost/rr.md.runs (not committed). Score: mean rounds to clean, never clean = 4: 2.381 on 165fafde → 2.524 (sd 1.052); cost 9.38 → 10.15 USD; first-repair fix rate 0.889 → 0.620 over the six fixtures with a rate; false fix lines 1 → 2. Errored runs: 0. Tokens per review are not in the run records, so no tokens saved is measured. Fix rate fails the 0.889 threshold: dead-code 0.78 against 1.00, duplicate-truth-source 0.50 against 0.50.
