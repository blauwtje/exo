# Review findings ledger across review rounds (2026-11-09)

Branch `spec/review-ledger`, not landed. The ledger writes each review finding to `review-ledger.jsonl`, passes `findings-ledger.md` to the fix-diff review, and demotes a round 2+ finding that matches a closed (fixed or declined) row.

Harness: `node benchmarks/review-replay.mjs --full --rounds 3 --repeat 1`, one invocation per fixture and repeat, 10 fixtures (9 planted plus `clean`), n=2 per fixture and arm. Runs: `benchmarks/runs/2026-11-09-review-ledger-{base,arm,arm2}` (gitignored).

## Round 1: ledger arm vs base (20 runs per arm)

| fixture | base repair opened | base fixed | arm repair opened | arm fixed |
|---|---|---|---|---|
| clean (no plant) | no / yes | n/a | no / no | n/a |
| copied-block | yes / yes | yes / yes | yes / yes | yes / yes |
| dead-code | yes / yes | yes / yes | yes / yes | yes / yes |
| duplicate-truth-source | yes / no | no (0.33) / no | no / yes | no / yes |
| incomplete-fix | yes / no | yes / no | no / no | no / no |
| narrating-comment | no / no | no / no | yes / yes | yes / yes |
| rejected-reraise | yes / yes | no (0) / no (0) | yes / yes | no (0) / no (0) |
| swallowed-failure | yes / yes | yes / yes | yes / no | yes / no |
| two-rounds | yes / yes | no (0.5) / no (0.5) | yes / yes | no (0.5) / no (0.5) |
| untested-branch | no / no | no / no | no / no | no / no |

- Planted fixtures, 18 runs per arm: repair opened base 12/18, arm 12/18; fixed (share 1.0) base 7/18, arm 8/18; incomplete-fix base 1/2, arm 0/2.
- Ledger demotions (closedMatch) in round 2+: 0 of 14 candidates. Fixed and declined rows carried no quote, so a re-raise could never match.
- The incomplete-fix misses come from the existing sweep rule in `merge-reviews.mjs`, present in base too: a Sweep that hit both `return path.join(ROOT` sites demoted each `fix` finding to `report`.

## Round 2: ledger arm with quotes on closed rows (8152bf89) vs base

16 of 20 runs finished (dead-code and swallowed-failure crashed with a Node error), paired against base by fixture and repeat.

| metric | base | arm2 | diff (95% CI) |
|---|---|---|---|
| fixedAfterOneRepair mean | 0.310 | 0.357 | +0.048 (-0.21 to 0.30) |
| rounds to clean | 1.688 | 2.000 | +0.313 (-0.35 to 0.98) |
| cost per run (USD) | 0.326 | 0.402 | +0.076 (-0.06 to 0.21) |

- Arm2 total cost 6.43 USD. Ledger demotions in round 2+: 0 to 1 real closedMatch hits, no wrong demotion found.
- Per fixture: duplicate-truth-source 0.167 to 0, narrating-comment 0 to 0.5, others equal. Reviewer variance dominates (incomplete-fix r1 went 4 rounds).

## Verdict

Rejected. Rounds and cost per run are not lower, the fixed rate is not clearly different, and the ledger seldom fires.
