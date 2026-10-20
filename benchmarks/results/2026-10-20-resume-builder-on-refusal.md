# Resume the builder on a refusal after GREEN

Tested on 2026-10-20 as a $0 offline replay of recorded real-use transcripts. Scripts, prereg and notes are local and untracked in the main checkout under `.exo/self-improve/s7/`.

Tests the route "resume the builder for a repair" in the form: after a build-task returns GREEN, run-unit runs `land-task.mjs --check` itself and, on a refusal, sends the refusal to the same builder with `SendMessage`. Prereg r3-test-H2-prereg.md (written before any run). Script tests/H2/carry.mjs (`--nocarry` is a sensitivity, not preregistered).

## Corpus
122 non-exo runs with a build-task or solve-hard dispatch, run cost $696.92, 101 post-GREEN repairs. Verdict subset = lead session start on or after 2026-10-09 (the budget-nudge fix): 10 runs, $89.93, 14 post-GREEN repairs. The subset misses the registered minimum sample (30 repairs and 20 runs), so it cannot pass.

## Premise
GREEN returns with no `land-task ... --check` call in their own transcript: 728 of 1019 (71%) on the full corpus, but 9 of 172 (5%) since 10-09. The "builder skipped its own check" half is already mostly fixed on main.

## Carry-model replay (same request count, no re-read removal)
| set | runs | post-GREEN repairs | bucket ($, % run) | saving ($) | % bucket | % run | 95% CI % run |
|---|---|---|---|---|---|---|---|
| post-10-09 (verdict) | 10 (6 with repair) | 14 | 2.55, 2.83% | -0.22 | -8.7% | -0.246% | -0.596 to 0.063 |
| full (sensitivity) | 122 (37 with repair) | 101 | 17.84, 2.56% | +1.52 | +8.5% | +0.218% | -0.141 to 0.696 |

Bar: at least 3% of the bucket, at least 0.3% of run and a CI lower bound above 0. Failed in both sets.

Split (full): build-task to build-task 80 repairs, actual $7.75 against resumed $9.74 (resume costs more); build-task to solve-hard 20 repairs, $9.54 against $5.57 (the only gain, from leaving the Opus tier); solve-hard to solve-hard 1. Since 10-09 there is one post-GREEN solve-hard repair, so the Opus-tier gain is mostly gone.

Why resume loses for build-task repairs: median resumed context 31-34k against 8.5k for a cold repair turn 1, so every repair request carries about 23k extra tokens at cache-read price, more than the saved cold start for short repairs (median $0.044). Warm share was 87% (full) and 100% (subset), so cache expiry is not the cause.

Quality guard: peak resumed context above 60k in 29% (subset) and 19% (full) of repairs, limit 10%. Fail. 3 of 14 (subset) and 15 of 101 (full) post-GREEN repairs were followed by another dispatch of the same task.

## Upper bound (not preregistered, `--nocarry`)
Dropping the carry: post-10-09 0.207% of run (CI 0.044 to 0.428), still under 0.3%; full corpus 0.65% of run (CI 0.20 to 1.25), but the carry is real cost.

## Caveats
GREEN classification reads the prior attempt's last assistant text. Solve-hard repairs are priced at the builder's model rates on solve-hard token counts, which favours the idea. The refusal message tokens are estimated at chars/4 of the repair prompt, a small overestimate against the carry.

Verdict: FAIL, reject. $0 spent, no branch. Ledger: row `resume-the-builder-for-a-repair-instead` rej, post-10-09 saving -0.25% of run (CI -0.60 to 0.06, n=14 repairs, 10 runs); full corpus +0.22% (CI -0.14 to 0.70).
