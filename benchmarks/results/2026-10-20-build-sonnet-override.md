# Build skill at Sonnet via `model: sonnet` frontmatter

Tested on 2026-10-20 as a $0 offline replay of recorded real-use transcripts. Scripts, prereg and notes are local and untracked in the main checkout under `.exo/self-improve/s6/`.

Verdict: FAIL at the $0 replay step. No paid run, no probe, no branch. Spent: $0.00.
Prereg: r1-test-F1-prereg.md (unchanged). Script: tests/f1-replay.mjs, output tests/f1-replay.out.json, log
tests/f1-replay.log; boundary diagnostic: tests/f1-bounds.mjs.

## Primary (other projects, strict turn end, pessimistic exit): 259 runs, $3.67/run, lead 43.9% of run cost
- Net saving, pooled: -3.24% of run cost, 95% bootstrap CI -4.37..-2.46 (10k resamples). Median per run: 0.00%
  (125/259 runs never call the build skill in the lead, so saving is 0); median among runs with a build call: -2.77%.
- Per run: gross saving (segment at Sonnet) $0.068, Sonnet cold write at entry $0.045, Opus rewrite at exit $0.142,
  net -$0.119. Net negative in 91 runs.
- Both thresholds missed (needed pooled and median >= +3.0%, CI lower bound > 0).

## Sensitivity (all fail the 3% bar)
| corpus | variant | pooled net % of run | 95% CI | build turn % of run / % of lead |
|---|---|---|---|---|
| other | strict, optimistic exit | -1.02 | -1.41..-0.49 | 5.1 / 11.5 |
| other | loose (task-notification keeps turn), pessimistic | -0.11 | -1.26..1.14 | 11.2 / 25.4 |
| other | loose, optimistic (best case) | +1.30 | 0.46..2.43 | 11.2 / 25.4 |
| exo repo | strict, pessimistic | -1.72 | -2.24..-1.28 | 1.1 / 2.8 |
| exo repo | loose, optimistic | +0.59 | 0.33..0.80 | 3.9 / 9.9 |
| sweep (reference) | loose, either exit | +3.50 | 2.26..4.07 | 30.3 / 47.8 |

## Why it fails
- The build turn is short in real use. 426 of 514 segment ends in other projects are `<task-notification>` wakes
  (diagnostic), 73 are human prompts. If a wake starts a new turn, as the docs' "next prompt" reading suggests, the
  override covers only 11.5% of lead cost (5.1% of run). Even if a wake does not end the turn, the turn holds 25% of lead.
- Each switch costs two cache rewrites of a large context: a cold Sonnet write at entry ($4/M vs $0.2/M Opus read)
  and an Opus rewrite at exit ($8/M vs $0.2/M read). Each build call pays this pair once. Because the turn is short,
  the pair costs more than the 50% price cut on the few requests in between. Even the optimistic exit, which rewrites
  only the turn's own tokens, leaves strict net negative. L6.1's "warm Opus prefix, free switch-back" claim misses that
  those turn tokens were written to Sonnet, not Opus, so Opus must write them again at exit.
- Sweep (headless, one long turn, no wakes) shows +3.5%, which is why a flow-unit A/B would mislead: its build turn is
  not representative of real use.

## Notes for other ideas
- Lead build-turn share (needed by F2/F5): strict 11.5% of lead / 5.1% of run; loose 25.4% / 11.2% (other projects).
- Variants B/C (gate rule: build turn >= 10% of run AND A fails the quality guard): A failed on cost, not on quality,
  so the rule does not trigger them. The only reading where the share passes 10% is loose (11.2%). B and C avoid the
  exit rewrite (the Opus lead never switches), so this replay neither proves nor rejects them.
- Risk not priced: verify sends `exo:fix-review` "with no model override", so under F1 it would inherit Sonnet in the
  build turn, a quality change outside the knob.
- Output tokens are repriced at the same count. Sonnet thinking length is not replayable, but the sign of the result
  does not depend on it because the switch costs alone exceed the gross saving under the primary reading.
