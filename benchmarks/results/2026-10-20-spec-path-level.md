# Spec stops at path level, the builder reads the lines

Tested on 2026-10-20 as a $0 offline replay of recorded real-use transcripts. Scripts, prereg and notes are local and untracked in the main checkout under `.exo/self-improve/s7/`.

Prereg r3-test-H3-prereg.md (written before any outcome number). Scripts tests/H3/extract.mjs and tests/H3/analyze.mjs.

## Primary (since 2026-10-09, non-sweep real use, 25 spec windows with a later build-task in the same session, 24 in the exo repo)
- Bucket B, lead code line-read calls in spec windows (request cost plus result carry): $5.02 = 2.79% of run cost ($180.39).
- Duplicates D, every path later read by a build-task or solve-hard of the same session: 22 of 128 calls, $0.87.
- S = D / B = 17.3% (bootstrap 95% CI 9.5 to 25.0); conservative cost basis 17.5% (CI 9.0 to 26.1). D is 0.48% of run (CI 0.21 to 0.86).
- Bar: point estimate at least 30% of B (with a CI lower bound above 3% of B and D above 0.08% of run). The point estimate and even the upper CI bound (25.0%) miss 30%, so gate 1 fails.
- Side columns: 80.9% of B is spent before the first no-tool lead turn; chains of 8 or more reads hold 21.5% of B.
- Guard (report only): 37 tasks, 25 repair dispatches (under 30, underpowered). Repair rate with a lead-line-read edited file 4/10, without 9/27; gap -6.7 points (upper Newcombe bound 23.2), no sign that line reads prevent repairs, but n is too small to clear the 5-point bar.

## Sensitivity and caveats
- Other projects only: 1 window, 3 calls (S 47%, no CI); the corpus is almost all exo-repo use, whose spec reads are skill files the builder edits, so S may overstate other repos.
- No all-dates run (7.8 GB of transcripts, and older data carries the budget-nudge defect); not needed for a FAIL on the post-10-09 verdict.
- No cross-session joins (a spec session whose plan is built by a separate `exo run` session is not counted), per prereg; this lowers n and could bias S either way.
- Duplicates are an upper bound on removable reads, because the lead may need those lines to judge. Path keys are the last two path components; the carry assumes no compaction.

Verdict: FAIL, reject. $0 spent, no branch. Ledger suggestion: `spec-stops-at-path-level-and-the-builder` rej, 17.3% of the spec code-read bucket (0.48% of run) is duplicated, bar 30%.
