# Repair dispatch inherits the failed attempt's facts

Tested on 2026-10-20 as a $0 offline replay of recorded real-use transcripts. Scripts, prereg and notes are local and untracked in the main checkout under `.exo/self-improve/s6/`.


Prereg: r2-test-G2-prereg.md (unchanged; one clarification added before the first run). Script: tests/g2.mjs; outputs tests/g2-cpt3.5.out (verdict), tests/g2-cpt2.17.out (sensitivity).

## Primary set (122 runs outside the exo repo, 54 with repairs, 264 repair dispatches, repair cost $76.4 = 11.0% of run cost)
- Hash-equal re-reads (unchanged-blob proxy), upper bound U: 1.56% of repair cost, 0.172% of run cost (CI 0.11-0.24%).
- Realizable R (minus paths the repair edits): 0.88% of repair cost (CI 0.65-1.19%), 0.097% of run cost (CI 0.069-0.126%).
- Bars: 15% of repair cost and 1.5% of run cost. Missed by about 17x and 15x; even U misses by 10x. Condition 1 and 2 fail, so FAIL (R <= U).
- 158 of 264 repairs have a matched read, so power is fine (>= 20). Guard: 13.9% of matched repairs edit a matched path (secondary set 19.1%); over the 10% limit as well.
- Secondary set (225 runs, 520 repairs): U 2.0% of repair cost, 0.20% of run; R 1.2% / 0.115%. Same verdict.
- CPT 2.17 sensitivity: see tests/g2-cpt2.17.out; same order of magnitude, no change in verdict.

## Why so small
A repair rarely sees the same tool output twice: after the failed attempt edits files, the same path read returns different text, and ranges differ. Matching by path only (below) is 20% of repair cost, but nearly all of it is reads of files the failed attempt edited or read in other ranges, which a `known: path@blob` line cannot replace (the blob changed or the content is needed to edit).

## Resume-the-builder retry condition (ledger row "Resume the builder for a repair instead of a fresh dispatch")
Retry: "a run shows a repair dispatch re-reading files the first build already read." Met at path level: 239 of 264 repairs (90.5%) read at least one path an earlier attempt read; the cost of those reads is 20.2% of repair cost and 2.2% of run cost (bootstrap CI 1.5-2.9% of run) in the primary set (secondary: 92.5%, 18.9%, 1.8%). So the retry condition is met and the `resume-the-builder` idea is retryable. Caveat: path-level overlap includes re-reads after edits and different ranges; this test does not show a resume would save that (the resumed context keeps stale reads and grows; the cost of carrying it is not measured). Not an L5.2 result.

## Verdict
FAIL: no branch. L5.2 mechanism (known: lines keyed by blob) addresses at most 1.6% of repair cost. Suggest ledger status `rejected` for L5.2 with this number; the resume-the-builder row's retry is now met and could be tested separately (it needs a paid or a carry-model replay of keeping the first attempt's context).
