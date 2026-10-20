# Review diff file under the spill size

Tested on 2026-10-20 as a $0 offline replay of recorded real-use transcripts. Scripts, prereg and notes are local and untracked in the main checkout under `.exo/self-improve/s7/` (prereg r4-test-I2-prereg.md, scripts tests/I2/replay.mjs and onread.mjs).

Idea: `verify.mjs --reviews-only` and the per-task review dispatch write a trimmed diff file (lockfiles and generated paths dropped, `-U2`, hunks headed `path:range`, 7 KB cap) under the output spill size, and `review-branch` reads it in place of `git diff/show/log` and re-Reads of `<persisted-output>` files.

## Primary (review-branch, first request on or after 2026-10-09; 320 reviews, 60 sessions, 293 reviews in the exo repo)
- Review cost $64.77. Bucket (git carry, spill re-access carry, detour requests) $10.75 = 16.6% of review cost; narrow git-only bucket $9.48.
- Credit only removed spill overhead: saving -$6.35 = -59.0% of the bucket, 95% CI -76.4% to -40.0% (bootstrap by session, 10,000 resamples). Bar: lower bound at least +3%. FAIL.
- Non-exo subset (27 reviews, 9 sessions, below the 100-review floor): -52.8% of bucket, CI -95.1% to +0.5%.
- Components: preview carry removed +$1.69, detour requests removed +$0.65, re-access carry swap -$0.84 (101 re-accessed git spills), never-re-accessed git spills now read in full -$7.85 (431 spills).

## Why
Of 532 git diff/show/log spills only 101 (19%) are ever re-accessed; in 81% the reviewer used the 2 KB preview and read targeted ranges. A named diff file is read whole, so those reviews would carry more bytes than today. The idea wins only when the replaced diff bytes are small, and the spill (about 8 KB in these transcripts) shows they are not.

## Post-hoc sensitivity (not the verdict)
Counterfactual: one read of the diff D at the first git request replaces all git carry, spill re-access and detours.
- D = largest single git result (optimistic, assumes every other git call is a duplicate): saving $2.36 = 24.9% of the narrow bucket, CI 16.3 to 33.9; 3.64% of review cost, CI 2.21 to 5.35.
- D = sum of all git diff/show/log results (no dedupe): -80.8% of bucket, CI -101.2 to -57.7.
The sign depends on how much git output is duplicate or never consumed, which the transcripts cannot show.

## Verdict
FAIL, reject. $0 spent (the paid findings-parity guard was not run because the $0 step failed), no branch.
