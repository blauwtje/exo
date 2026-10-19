# Ideas results: spec-seats

Variant `spec-seats` (`benchmarks/variants.mjs`): spec step 1 options line points at `references/architecture-sketch.md`, swapped for `benchmarks/arms/spec-seats-sketch.md`; the lead dispatches 3 `general-purpose` seats in one message, each with one seat and one forbidden move, screens their replies and shows the 2-3 most distinct with one recommendation.

Decision rule, fixed before any score:
- Ship (P2b) only when mean originality rises over base by at least the bench's minimum detectable effect (base MDE 0.379, about 0.4), so originality >= 1.776, and mean fit stays at 3.2 or higher.
- Otherwise drop the variant and keep spec unchanged.
- Also reported, not part of the rule: modalShare per case and mean (base 0.93), and the token cost ratio spec-seats / base, from each run's `result` event in `stdout.json` (`modelUsage` tokens summed over models, and `total_cost_usd`).
- Caveat fixed in advance: originality and fit are means over the options a run shows; this variant shows 2-3 screened options against base's 3-5, so the per-option mean is not the recommended option's score (P1 `recommendedOriginality` is not landed).

Base: `.exo/ideation-bench/runs/base/base` (n=15, opus high), results in `2026-10-18-ideas-baseline.md`.

## Scores

Base n=15 (5 per case), spec-seats n=45 (15 per case); judge calibration 0.917 within 1 of the key. Base re-scored with the `ideas-metrics` scorer so the new metrics exist for both.

| metric | base | spec-seats |
| --- | --- | --- |
| originality | 1.413 | 1.993 |
| fit | 3.438 | 3.598 |
| options shown | 4 | 3.467 |
| recommendedOriginality | 1.067 | 1.6 |
| recommendedFit | 4 | 3.933 |
| modalShare (mean) | 0.933 | 0.644 |
| modalShare notes / shopping / tide | 1 / 0.8 / 1 | 0.733 / 0.667 / 0.533 |
| tokens per run | 75900 | 262881 |
| costUsd per run | 0.127 | 0.496 |

Cost ratio spec-seats / base: tokens 3.46x, costUsd 3.91x.

## Verdict

Ship (P2b) per the fixed rule: originality 1.993 >= 1.776 and fit 3.598 >= 3.2. The recommended option also gains originality (1.067 to 1.6, above the 0.4 MDE) with recommendedFit flat (4 to 3.933, within MDE). Caveat: seats showed a mean 3.47 options, not 2-3 as designed, versus base 4, so the per-option means are comparable only roughly; recommendedOriginality is the like-for-like read and agrees. Cost is about 3.9x per run, a price the rule did not weigh. Base has n=15 against seats n=45.
