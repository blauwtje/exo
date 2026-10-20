# Verify scripts print the chained next step

Tested on 2026-10-20 as a $0 offline replay of recorded real-use transcripts. Scripts, prereg and notes are local and untracked in the main checkout under `.exo/self-improve/s9/` (r6-test-K2.md, prereg r6-test-K2-prereg.md; scripts tests/K2/census.mjs, boot.mjs).

Idea: `verify.mjs` and `merge-reviews.mjs` print the chained next step, so the lead acts once per stage and reads fewer report files.

Verdict: FAIL ($0 spent, paid step of $1.5 not run, no branch). The sample is thin and the lower bound misses: removable share of the lead runner bucket is 2.37% on the prereg estimate, CI [1.63%, 3.20%] (bar: lower bound at least 3%).

## Evidence
- Sample: 11 current-design sessions (run start on/after 2026-10-13) have a review phase, 10 with lead verify requests; the floor was 15 sessions.
- Verify-phase lead requests: 325, $10.12 (17.2% of those 10 sessions' runner bucket of $58.90). Classes: bashread 87 ($2.63), wake 74 ($2.00, excluded), git 61 ($1.65), bashother 45 ($1.76), dispatch 38 ($1.45), script (verify.mjs, merge-reviews) 10 ($0.29), read 5, mixed 5.
- The lead runs verify.mjs or merge-reviews itself in only 10 of 325 requests, so a chained next step there removes little. The largest removable-looking class is reading report or background-task output files, which is waiting on the gate, not a chained step.
- Cluster bootstrap over sessions (10000): removing all bashread and read is 4.74% of the bucket, CI [3.29%, 6.41%], an unsupported upper bound; half of it (prereg estimate, a script carries only part) is 2.37%, CI [1.63%, 3.20%].
- Quality guard moot: no dispatch is removed, so the fix-review count is unchanged by construction.
- The lead build-phase side bucket was not run: its 79 no-tool wake-ups are excluded and the bar failed on the main bucket.
