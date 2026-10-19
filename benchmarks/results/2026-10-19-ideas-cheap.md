# Ideas results: cheap divergence variants

Goal: a spec options step near base cost (<= 1.5x) that matches spec-seats gains. Each arm is a variant of `spec` step 1 options line (`benchmarks/variants.mjs`, arm files under `benchmarks/arms/`).

Decision rule, fixed before any score: a variant passes when originality >= 1.776 (base + MDE), fit >= 3.2, modalShare <= 0.80 and costUsd <= 1.5x the new base.

Setup: opus high, n=15 per arm (5 per case), same judge (calibration 0.917 within 1 of the key). The new arms (spec-draw-tail, spec-negate, spec-prior-art, spec-prior-art-sonnet, spec-seats-fork) and base(new) ran concurrently on 2026-10-19 with `--jobs 3`; spec-draw and spec-tail ran earlier, one at a time (own results files). Ratios use base(new), $0.129 per run. spec-seats-fork ran with `CLAUDE_CODE_FORK_SUBAGENT=1`. Failed runs: none in any arm. Cost per run varies widely inside an arm, so ratios carry that noise; the originality MDE at n=15 is about 0.4.

Wiring checked on each new arm's first cell: the prior-art helper ran WebSearch and `gh` as haiku, prior-art-sonnet as sonnet; seats-fork seats ran as `fork` subagents with cache reads (about 180k tokens in the lead).

| arm | originality | fit | recOrig | recFit | modal mean | modal notes/shopping/tide | tokens/run | costUsd/run | cost ratio | verdict |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| base (new) | 1.433 | 3.477 | 1.067 | 4 | 1 | 1 / 1 / 1 | 78744 | 0.129 | 1x | reference |
| spec-draw | 1.917 | 3.7 | 1.333 | 4 | 0.8 | 0.8 / 1 / 0.6 | 155085 | 0.258 | 2x | fail: cost 2x > 1.5x |
| spec-tail | 1.956 | 3.711 | 1.133 | 4.133 | 0.667 | 0.6 / 0.8 / 0.6 | 226276 | 0.366 | 2.84x | fail: cost 2.84x > 1.5x |
| spec-draw-tail | 2.122 | 3.617 | 1.733 | 3.933 | 0.733 | 0.8 / 0.8 / 0.6 | 145010 | 0.282 | 2.19x | fail: cost 2.19x > 1.5x |
| spec-negate | 1.817 | 3.744 | 1.4 | 4 | 0.8 | 1 / 0.8 / 0.6 | 160232 | 0.279 | 2.16x | fail: cost 2.16x > 1.5x |
| spec-prior-art | 2.011 | 3.606 | 1.867 | 3.8 | 0.8 | 0.6 / 1 / 0.8 | 413539 | 0.478 | 3.71x | fail: cost 3.71x > 1.5x |
| spec-prior-art-sonnet | 2.4 | 3.428 | 2.267 | 3.867 | 0.6 | 0.2 / 1 / 0.6 | 454558 | 0.596 | 4.62x | fail: cost 4.62x > 1.5x |
| spec-seats-fork | 1.672 | 3.722 | 1.067 | 4 | 0.8 | 1 / 0.4 / 1 | 419055 | 0.484 | 3.75x | fail: originality 1.672 < 1.776; cost 3.75x > 1.5x |
| base (2026-10-18) | 1.413 | 3.438 | 1.067 | 4 | 0.933 | 1 / 0.8 / 1 | 75900 | 0.127 | 0.98x | reference |
| spec-seats (2026-10-18) | 1.993 | 3.598 | 1.6 | 3.933 | 0.644 | 0.733 / 0.667 / 0.533 | 262881 | 0.496 | 3.84x | fail: cost 3.84x > 1.5x |

## Reading

- No arm passes: every arm that clears originality costs 2x or more of base.
- spec-prior-art clears originality (2.011), fit and modal (0.80) and fails only on cost (3.71x); spec-prior-art-sonnet has the highest originality (2.4) and recommended originality (2.267) but fit 3.428 and 4.62x cost.
- Cheapest arms: spec-draw (2.00x, originality 1.917), spec-draw-tail (2.19x, originality 2.122, recommendedOriginality 1.733) and spec-negate (2.16x, originality 1.817). All beat base on originality at about 2x; none reach 1.5x.
- spec-seats-fork costs the same as spec-seats (3.75x) and does not keep its originality (1.672 against 1.993).
- base(new) matches base(2026-10-18) within noise (originality 1.433 against 1.413, cost 0.129 against 0.127).
