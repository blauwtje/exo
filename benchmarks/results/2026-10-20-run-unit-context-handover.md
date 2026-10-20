# run-unit hands over at 50k context

Tested on 2026-10-20 as a $0 offline replay of recorded real-use transcripts. Scripts, prereg and notes are local and untracked in the main checkout under `.exo/self-improve/s9/` (r5-test-J3.md, prereg r5-test-J3-prereg.md).

Idea: `run-unit` returns a HANDOVER line once its context passes 50k tokens after a landing, and the lead dispatches a fresh unit, instead of splitting blocks by task count.

Verdict: FAIL at the $0 replay step. No paid run, no branch. Spent: $0.00.
Primary (C = 50k, current omitClaudeMd shape, measured lead cycle $0.097): net saving -3.79% of run-unit cost, 95% CI [-6.14, -0.63] (cluster bootstrap over 49 sessions, 10k resamples). Pass needed CI lower bound >= +3.0%.
Gross saving before any charge is $1.02, 3.6% of the $28.10 bucket. The startup rerun alone ($1.02 over 11 splits) cancels it: with the lead cycle set to $0, net is +0.02% [-1.34, 2.44].
The quality guard fails too: 2 of 11 split units (18%, limit 10%) re-dispatch or message a pre-split build. In 8 of 11, a pre-split build was still in flight at the split landing. A drain-first rule (hand over only with nothing in flight) finds no split point in any unit.
Not a variation of H1 (block-cap-16, rej): H1 merges blocks by task count, while J3 splits them on context. Both fail for the same reason, though: each block boundary costs more than the context it moves.

Prereg: s9/r5-test-J3-prereg.md (unchanged). Script: s9/tests/J3/replay.mjs. Outputs: s9/tests/J3/out-50k.json, rows-50k.json, sens.txt.

## Data
- Real-use run-units (user projects plus the exo repo, no sweep, no tmp) whose first timestamp is on or after 2026-10-09: 98 units in 49 sessions, bucket $28.10.
- Current shape: the CLAUDE.md `instructions` attachment (median 1.6k tokens at 3.5 chars per token) is subtracted from context before testing C. No unit after df0358f3 exists yet, so the shape is modelled, not observed.
- Peak context over 50k: 19 of 98 units. Only 11 of them have a successful landing (`Committed: <sha>` or `LANDED <n> <sha>`) after the crossing and before the last request, so only 11 can split.
- Lead cycle (request that receives a run-unit completion notification through the request that dispatches the next run-unit, with no human message between): n=27, median $0.097, IQR $0.056-0.185. This is lower than H1's $0.21.

## Results (net % of run-unit bucket, 95% CI)
| C | lead cycle | splits | saved | charges | net % | CI |
|---|---|---|---|---|---|---|
| 50k | $0.097 measured (primary) | 11 | $1.022 | $2.087 | -3.79 | [-6.14, -0.63] |
| 50k | 0 | 11 | $1.022 | $1.016 | +0.02 | [-1.34, 2.44] |
| 50k | $0.21 (H1) | 11 | $1.022 | $3.326 | -8.20 | [-12.31, -2.95] |
| 40k | 0 | 15 | $1.027 | $1.275 | -0.88 | [-2.40, 1.65] |
| 60k | 0 | 5 | $0.678 | $0.495 | +0.65 | [-0.88, 2.78] |
| 50k repeat splits | 0 | 12 | $1.069 | $1.156 | -0.31 | [-1.68, 2.19] |
| 50k drain first | any | 0 | 0 | 0 | 0 | n/a |

No variant gets close to +3%, even with the lead cycle set to $0, which is the most favourable case.

## Why it fails
- Excess context is rare and short-lived. Only 19% of units cross 50k, and they cross late, so few requests carry the extra ~40k tokens. At the cache-read price, that carry is worth about $0.09 per split unit.
- A fresh unit costs that much again. Its startup (prompt write, next-task, first dispatch) averages about $0.09, and the lead pays a measured $0.10 to wake and re-dispatch.
- r4-L5 put 18.6% of run-unit cost in the >=2x group as "excess". That figure is variance against a size fit, not tokens a handover could remove. Most of it is per-request output and write cost, which a split does not touch.
- Rolling-window units almost always have a build in flight when a task lands (8 of 11 at the split point). A safe handover would first have to stop refilling and drain, which costs wall time, and no recorded unit reaches a drained landing after 50k.

## Guard and feasibility
- Feasibility: the lead loop (skills/build/references/run-loop.md step 6, "Loop to step 3") already recomputes the block with `next-task.mjs --block`, so a HANDOVER line needs no new script path. The rolling window is the obstacle, not the lead route.
- Continuity: 2 of 11 split units (18%) break, against a limit of 10%.
- Tool results over 8k chars in run-units: only 3, all `Read`, 2 of them in split units. Build-task returns are not large, so a return cap would not help either.

## Caveats
- The replay keeps each post-split request's cache-write tokens and output unchanged and moves only cache reads. A fresh unit could behave differently, but that would not close a gap of this size.
- The landing detection uses success strings from the current scripts. Older wording may hide a few landings, but that only shrinks the split set.
