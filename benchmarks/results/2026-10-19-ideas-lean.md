# Ideas results: lean variants

Goal: keep the originality of the cheap-ideas arms while cutting cost to <= 1.5x base. Cheap-ideas runs did not stop at the options (many wrote a spec, ran plan-check or dispatched agents), so each lean arm is its source arm plus three lines after Show and pick: ask the user to pick and stop (no spec file, no plan-check, no agent beyond the arm's own helper); each option at most 10 lines; at most 3 file reads beyond the repo map. The prior-art lean arms also cap the helper at 6 searches and a 15-line reply. `spec-draw-tail-lean-xhigh` is spec-draw-tail-lean with the lead at `--effort xhigh` (`EXO_IDEAS_EFFORT=xhigh`; the bench default is opus high). Arm files: `benchmarks/arms/*-lean-sketch.md`.

Decision rule, fixed before any score: a variant passes when originality >= 1.776, fit >= 3.2, modalShare <= 0.80 and costUsd <= 1.5x the new base.

Setup: opus high, n=15 per arm (5 per case), same judge as the earlier files. The five new arms (fresh base and four lean) ran concurrently on 2026-10-19 with `--jobs 3`, each its own `--out`. The first launch used `--n 15`, which is 15 per case; the arms were scored on runs 1-5 per case only, to match the earlier files. For `spec-draw-tail-lean-xhigh`, notes runs 1-3 are from the first launch and notes runs 4-5 from a rerun of that arm (it had not reached them before it was stopped). Failed runs: none. Ratios use the new base, $0.126 per run; the earlier rows are copied from `2026-10-19-ideas-cheap.md` and `2026-10-18-ideas-spec-seats.md`, and their ratios are recomputed against this base (they ran on different days or at a different load).

"Stopped at options" counts runs with no Write/Edit tool call, no plan-check command and no Agent call beyond the arm's one helper (read from `stdout.json`).

| arm | originality | fit | recOrig | recFit | modal mean | modal notes/shopping/tide | costUsd/run | cost ratio | stopped at options | verdict |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| base (new) | 1.389 | 3.539 | 1 | 3.933 | 1 | 1 / 1 / 1 | 0.126 | 1x | 15/15 | reference |
| spec-seats (2026-10-18) | 1.993 | 3.598 | 1.6 | 3.933 | 0.644 | 0.733 / 0.667 / 0.533 | 0.496 | 3.94x | not measured | fail: cost 3.94x > 1.5x |
| spec-draw-tail (earlier) | 2.122 | 3.617 | 1.733 | 3.933 | 0.733 | 0.8 / 0.8 / 0.6 | 0.282 | 2.24x | not measured | fail: cost 2.24x > 1.5x |
| spec-prior-art-sonnet (earlier) | 2.4 | 3.428 | 2.267 | 3.867 | 0.6 | 0.2 / 1 / 0.6 | 0.596 | 4.73x | not measured | fail: cost 4.73x > 1.5x |
| spec-draw-tail-lean | 2.306 | 3.717 | 2 | 3.933 | 0.467 | 0.6 / 0.4 / 0.4 | 0.205 | 1.63x | 15/15 | fail: cost 1.63x > 1.5x |
| spec-prior-art-lean | 2.45 | 3.617 | 2.333 | 3.933 | 0.533 | 0.4 / 0.6 / 0.6 | 0.310 | 2.46x | 14/15 | fail: cost 2.46x > 1.5x |
| spec-prior-art-sonnet-lean | 2.311 | 3.656 | 2.2 | 3.867 | 0.4 | 0.2 / 0.6 / 0.4 | 0.344 | 2.73x | 15/15 | fail: cost 2.73x > 1.5x |
| spec-draw-tail-lean-xhigh | 2.372 | 3.622 | 1.933 | 3.867 | 0.533 | 0.8 / 0.4 / 0.4 | 0.416 | 3.30x | 14/15 | fail: cost 3.30x > 1.5x |

## Reading

- No arm passes; every lean arm clears originality, fit and modal share and fails only on cost.
- spec-draw-tail-lean is the closest: originality 2.306 (earlier spec-draw-tail 2.122), cost 1.63x against 2.24x, and every run stopped at the options. Its cost spread is small (sd 0.02), so 1.63x is not noise around 1.5x.
- Stopping at the options removed most of the extra cost for the arm with no helper (2.24x to 1.63x); the prior-art arms stay at 2.5-2.7x because the helper's searches dominate (tokens 230k-239k per run against 92k).
- xhigh raised cost to 3.30x (sd 0.24, one run above $1) with no originality gain over high (2.372 against 2.306).
- Base and spec-seats modal means match the earlier files; the lean arms' modal shares (0.40-0.53) sit below the 0.80 bar, though modal share at n=5 per case moves in steps of 0.2.
