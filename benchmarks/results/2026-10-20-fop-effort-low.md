# find-open-points at low effort

Tested on 2026-10-20 as a $0 offline replay of recorded real-use transcripts. Scripts, prereg and notes are local and untracked in the main checkout under `.exo/self-improve/s9/` (r5-test-J4.md, prereg r5-test-J4-prereg.md).

Idea: the open-point agent's kind changes to `low` effort.

Verdict: FAIL (structurally unreachable bar; $0 spent, no paid run, no branch).
Number: the kind change reaches runs worth 11.4% of the find-open-points bucket (19.8% if the 14 runs with no recorded effort count). Hidden thinking in those runs is $0.43 of the $20.76 bucket (2.1%; 4.2% with the unrecorded runs). Removing ALL of it would save at most 2.1% (4.2%), under the 3% bar. At the idea's own 30-50% thinking cut: 0.6-1.0% (1.3-2.1%). Bootstrap CI not computed: the upper bound already misses.

## Evidence
- Corpus: 79 find-open-points runs, real use, first request on/after 2026-10-09 (s7/tests/r4L2/collect.out.json), effort read from each run's `.meta.json`. Script: s9/tests/J4/bound.mjs (rerun: `node s9/tests/J4/bound.mjs` from .exo/self-improve).
- Effort the runs actually had:

| effort | n | cost | share of bucket | hidden-thinking $ | mean $/run |
|---|---|---|---|---|---|
| medium | 34 | 2.37 | 11.4% | 0.43 | 0.070 |
| unrecorded | 14 | 1.74 | 8.4% | 0.44 | 0.124 |
| xhigh | 15 | 5.65 | 27.2% | 2.11 | 0.376 |
| max | 16 | 11.00 | 53.0% | 5.56 | 0.688 |

- Why 80% of the bucket is above medium: hooks/agent-effort.mjs `raised()` (commit 323b1ab8, "raise the open-point agent to the session's effort") sets fop to the session effort when that is xhigh or max, before the kind table is read. A `low` kind cannot change those runs. The user's sessions run xhigh/max often.
- To reach 3% of the bucket the controlled runs would need a saving S >= 26.3% of their cost (15.1% with the unrecorded runs) as the CI lower bound. r4-L2 expected 12-20% of agent cost, and medium-effort runs are cheap ($0.07), so the reachable ceiling is about 1-2%.
- The r4-L2 estimate (12-20% of the whole bucket) took the 41% hidden-thinking share of the whole bucket; that share sits in the xhigh/max runs (7.67 of the 8.54 hidden-thinking dollars), which the proposal does not touch. Cause of the mismatch: the idea file did not stratify by actual effort.
- Shared kinds: `investigate` is also used by survey-ui and the unnamed general-purpose/claude types, so the change would need a new `open-points` kind; not built.

## Not tested, and why
- Dropping or lowering the xhigh/max raise would hit the 80% (hidden thinking $7.67 of $20.76 in the raised runs), but it reverses a deliberate quality decision (323b1ab8) and is a different idea with a recall guard; it needs its own prereg and a paid A/B on real briefs (n >= 8 pairs, about $4-5 at $0.26-0.7 per run, above this cap). Suggest as a follow-up idea `fop-no-raise`, with the guard that `user` points match.
- Paid A/B skipped: the brief says paid only when the $0 step passes; it does not, and a paid result could not change the bound.

## Caveats
- "Hidden thinking" is the estimate from r4-L2 (output tokens minus visible text and tool input chars/3.3); transcripts store thinking empty.
- The 14 unrecorded-effort runs (all Sonnet, 2026-10-11 to 10-13) have no `effort` in meta.json; I could not tell if they ran medium or inherited the session. Both readings are shown.
- Pairs of the same brief at two efforts were not measured; the bound uses the real-use effort mix only.
