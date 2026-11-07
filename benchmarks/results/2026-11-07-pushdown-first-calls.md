# Pushdown of build-task first calls, 2026-11-07

Cell flow-unit, n=15 per side, main (f6406ebd) against idea/pushdown.

| side | n | pass | median first-edit calls | mean first-edit (se) | median pathCalls | median wall | median cost |
|---|---|---|---|---|---|---|---|
| main | 15 | 15/15 | 10 | 9.97 (0.033) | 21 | 71.8 s | $0.323 (mean 0.333) |
| idea/pushdown | 15 | 15/15 | 10.5 | 10.54 (0.124) | 23 | 74.8 s | $0.337 (mean 0.337) |

Total spent: $10.05 (main 4.996, pushdown 5.057). No hang or timeout.

Verdict: no change at best. Calls before the first edit rose 5.7% instead of dropping, and mean cost rose 1.2% against a required 3.0% drop. The first-edit gap of 0.57 is about 4.5 se, so the rise is real but small; the cost gap is within spread.

Commands (dry-run projection for main: $8.25):

    node benchmarks/improve-speed.mjs --dry-run --full --repeat 15 <checkout>
    node <checkout>/benchmarks/sweep.mjs --set flow --cells flow-unit --repeat 15 --concurrency 5 --confirm --out .exo/yard-<main|cand> --results .exo/yard-<side>-results
    node benchmarks/improve-speed.mjs --full --repeat 15 --measure firstEditCalls --from .exo/yard-<side>
