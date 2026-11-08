# Consolidation commit d388cba1: flow-unit before and after

Before `1aa90bb0`, after `4850c675` (the consolidation d388cba1 plus two fixes). Cell `flow-unit`, n=3 per side, Claude Code 2.1.319, `claude-sonnet-5-5` at high effort. Each side ran its own checkout (`node <checkout>/benchmarks/sweep.mjs --set flow --cells flow-unit --repeat 3 --confirm`), both at once.

All 6 runs exited 0, hit no time-out, passed the hidden check and landed 4/4 tasks.

| side | hidden pass | landed 4/4 | clean exit |
|---|---|---|---|
| before | 3/3 | 3/3 | 3/3 |
| after | 3/3 | 3/3 | 3/3 |

| metric | before mean | sd | min-max | after mean | sd | min-max |
|---|---|---|---|---|---|---|
| cost $ | 0.370 | 0.036 | 0.335-0.407 | 0.348 | 0.171 | 0.152-0.467 |
| total tokens (k) | 160.8 | 18.1 | 143.1-179.3 | 148.4 | 75.3 | 62.2-201.2 |
| main-session tokens (k) | 63.9 | 8.9 | 54.5-72.2 | 32.9 | 9.0 | 23.2-41.0 |
| wall s | 101.9 | 20.2 | 85.0-124.2 | 116.7 | 34.5 | 85.7-153.8 |
| main-session turns | 11.0 | 1.0 | 10.0-12.0 | 5.0 | 1.0 | 4.0-6.0 |

Per run (cost $ / total tokens / wall s / main turns from the transcript / stdout num_turns):

| run | before | after |
|---|---|---|
| 1 | 0.407 / 179284 / 96.5 / 12 / 8 | 0.467 / 201243 / 153.8 / 4 / 4 |
| 2 | 0.368 / 160034 / 85.0 / 10 / 7 | 0.425 / 181866 / 110.6 / 6 / 6 |
| 3 | 0.335 / 143143 / 124.2 / 11 / 6 | 0.152 / 62170 / 85.7 / 5 / 2 |

Main-session tokens are weighted input plus output of the main transcript (usage.json byRole.main). Main-session turns are unique assistant message ids in the main transcript; stdout num_turns is shown beside them and disagrees in 4 of 6 runs, so the transcript count is the one used.

## Difference after minus before

Repo helpers: `pairedArms` and `verdictWord` from `benchmarks/interval-text.mjs` over `lib/eval-stats.mjs`, runs paired by repeat index, 95% interval with z 1.96 (a normal interval at n=3 is narrower than a t interval would be). A Welch two-sample interval is shown beside it.

| metric | paired interval | word | Welch interval |
|---|---|---|---|
| cost $ | -0.022 (-0.180 to 0.136) | noise | -0.022 (-0.220 to 0.176) |
| wall s | 14.8 (-40.5 to 70.0) | noise | 14.8 (-30.4 to 59.9) |
| total tokens | -12394 (-79601 to 54813) | noise | -12394 (-100055 to 75267) |

## Verdict

not-shown. Both cost and wall intervals contain zero and the pass rate is 3/3 on both sides. The point estimates are a cost change of -$0.022 (about -6%) and a wall change of +15 s. Main-session turns fell from 11 to 5 and main-session tokens from 63.9k to 32.9k, which fits a lighter lead, but those two metrics are outside the verdict rule and rest on 3 runs. The minimum detectable effect at n=3 per side is about 1.98 sd (sweep dry-run), so only a very large effect would show.

## Known disturbances

- n=3 per side. The pool doc `2026-10-29-flow-unit-base-pool.md` shows wall from 99.8 s to 279.8 s for one cell, so a 3-run wall mean is not precise.
- The two arms ran in parallel and shared rate limits and machine load. Run 3 on the after side finished in 62k tokens with a stdout num_turns of 2, the cheapest run of all six, and pulls the after sd up.
- Each side used its own harness revision (62 benchmark files differ between the commits; sweep.mjs and the cell definitions differ by refactors only, metric definitions are unchanged).
- Spec was not measured: only flow-unit ran, and no flow-unit step is named spec in `benchmarks/cell-steps.json`.
- Cache rates: benchmark main threads write 99.9% of cache tokens at the 1-hour rate and subagents at the 5-minute rate (`2026-11-02-subscription-usage.md`). Both sides ran the same CLI, so the rates match, but a stored baseline from another cache setting would not pair.
- Spend: $2.15 for 6 runs.
