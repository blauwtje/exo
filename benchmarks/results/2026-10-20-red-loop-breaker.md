# Red-loop breaker for build-task

Tested on 2026-10-20 as a $0 offline replay of recorded real-use transcripts. Scripts, prereg and notes are local and untracked in the main checkout under `.exo/self-improve/s9/` (r5-test-J2.md, prereg r5-test-J2-prereg.md).

Idea: after the 2nd red Proof run a build-task diagnoses and returns BLOCKED when the cause is the plan.

VERDICT: FAIL (offline replay, $0 spent, no branch)
Net saving: -0.5% of build-task cost (CI95 [-1.4%, +0.5%]); bar was CI lower bound >= 3%. Even the upper-bound arm (all cost after the 2nd red removed, impossible in practice) is 9.9% [7.6%, 12.2%], and the realistic arm is negative.
Quality guard: plan-defect share 41% (35 of 85 loops) passes the >= 30% guard; green-within-one-more-edit share 35% passes < 50%. The guard passes but the saving does not.

## Setup (as preregistered in r5-test-J2-prereg.md)
- Script: s9/tests/J2/collect.mjs (own copy of the r4L5 parser), an.mjs (analysis), rows.json (data). Corpus: real-use build-task agents, ts >= 2026-10-09, no sweep or tmp: 508 agents, $78.06.
- Loop agent = >= 2 red Proof/test runs (non land-task): 85 agents, $22.73 (29% of cost).
- Cost after the 2nd red request (post2): $7.70 total (9.9% of build-task). This is the most any breaker could remove.
- Plan-defect classification (edit to test/brief after the 2nd red, or non-GREEN return, or a later repair dispatch of the same task): 35 loops; genuine source-only loops: 50.
- Measured repair-dispatch median: $0.079 (n=93 later dispatches of the same plan task), used instead of the $0.10 floor since n >= 5.
- Saving rule: plan-defect loop = post2 - one median request (diagnosis turn) - repair median; genuine loop = - one median request (the diagnosis turn adds cost, no early exit possible because the fix is source-only).

## Why it fails
- 59% of loops are genuine source-only loops; a diagnosis turn only adds cost there.
- Plan-defect loops: cost after the 2nd red is 4.1% of build-task at most (35 loops); after the diagnosis turn and the repair dispatch (~$0.08 each) the net is +0.14% of build-task. Genuine loops charge -0.61%. Sum: -0.5%.
- The prompt already carries the stop rule: agents/build-task.md has said "Stop at green, a second test or `Run:` failure" since f5b9c411 (2026-09-25), and "Red `Proof:` -> rerun at most once per edit" since e84d111e (2026-10-16). The post-cut loops measured here ran under the first rule. The remaining idea (diagnosis + BLOCKED on plan defect) is the only new part, and it is not net-positive.
- r4-L5's 11.5% was the excess of the whole red-loop group ($14.1 of $122.5, all dates, vs peers). That is the cost of loop agents versus cheap agents, not the cost after the 2nd red, which is what the breaker can touch.

## Notes
- Caveats: red detection uses the r4L5 regexes (TEST_RE/FAIL_RE), which can count a failing lint or tsc run as red; the classification of plan defect is approximate (generous to the idea, since a later repair dispatch of the same task counts as plan defect even when the cause was code). Both biases favour the idea, and it still fails.
- No paid run: the offline replay is valid and fails, so the $0 step does not pass.
