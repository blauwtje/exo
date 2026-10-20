# L3.1 stage checkpoint fork: verify-only fork vs full flow-unit verify block

Question: does a verify-only session forked from a kept flow-unit cell (wound back to just before the lead's first `exo:verify` call) spend what the full cell spent from that call on? If so, a review-side candidate could be measured on forks at a fraction of a full cell's cost.

Verdict: **FAIL**. Fork verify-block tokens differ from the full cells' (Mann-Whitney p=0.008); thresholds were set before any spend (`.exo/self-improve/scores-L3.md`, "## Paid step 2").

## Method

- Branch `feat/sweep-keep-repo` (`554a9b4c`), worktree `.worktrees/l31-keep-repo`.
- Full arm: `node benchmarks/sweep.mjs --set flow --cells flow-unit --repeat 5 --confirm --keep-repo .exo/l31/keep --out .exo/l31/full --results .exo/l31`. 5 `claude -p` calls (claude-sonnet-5-5, effort high), concurrency 2.
- Fork arm: `node benchmarks/checkpoint-fork.mjs --checkpoints .exo/l31/keep --full-runs .exo/l31/full --forks 2 --out .exo/l31/forks --confirm --max-usd 2.9565` (6.00 cap minus the full arm's $3.0435). The script reserves $1 per fork before starting it, so it stopped after 8 of 10 forks (`stopped before flow-unit-5-fork-1: 2.126 USD spent`). Cells 1-4 have 2 forks each, cell 5 none.
- Verify block, both arms: `verifyBlock` in `benchmarks/checkpoint-fork.mjs`. It counts the lead from its verify Skill call on, plus every subagent that starts at or after that call. Cost uses `countsCost`; tokens are weighted input plus output. Stats: `mannWhitney`/`meanAndSd` from `benchmarks/statistics.mjs`. Fisher exact (two-sided) for the rates, computed by hand from the 2x2 tables because `statistics.mjs` has no Fisher test.

## Thresholds (pre-set)

PASS needs all of: (a) verify cost MW p>0.05; (b) verify tokens MW p>0.05; (c) fix-loop rate Fisher p>0.05; (d) hidden-test pass Fisher p>0.05; (e) fork cost per sample <= 50% of a full cell's mean. If any fails, the verdict is FAIL. If an arm has too few samples to test, the verdict is INCONCLUSIVE.

## Results

| Measure | Full (n=5) | Fork (n=8) | Test | Criterion |
|---|---|---|---|---|
| verify cost USD, mean (sd) | 0.222 (0.062) | 0.266 (0.031) | MW p=0.242 | (a) pass |
| verify tokens, mean (sd) | 69,943 (6,224) | 86,038 (8,686) | MW p=0.008 | (b) **fail** |
| verify wall s, mean (sd) | 54 (21) | 65 (8) | MW p=0.380 | (info) |
| fix-loop rate | 0/5 | 0/8 | Fisher p=1.000 | (c) pass, no information |
| hidden-test pass | 5/5 | 8/8 | Fisher p=1.000 | (d) pass, no information |
| cost per sample | 0.609 (whole cell) | 0.266 (whole fork) | ratio 0.44 | (e) pass |

Per full cell cost: 0.604, 0.639, 0.515, 0.665, 0.621. Per fork cost: 0.291, 0.238, 0.312, 0.240, 0.287, 0.249, 0.281, 0.227.

## Where the token gap is (supplementary, after the verdict)

Split of the verify block into lead and subagents (`.exo/l31/tools/split.mjs`):

- Subagents (review-branch etc.): full mean 27.1k weighted tokens, fork 25.2k; MW p=0.661. The forks reproduce this part.
- Lead: full 38.8k-48.7k, fork 53.2k-73.2k; MW p=0.003. Lead cache writes: full about 8k per cell, fork 16.6k-21.6k (MW p=0.003). Fork leads also make 8-11 API calls; full leads make 7-9.

The design is wrong for lead-side measures. A fresh `claude -p` fork starts cold, so it pays cache creation for the system prompt, tools and skill load, which a full cell's lead already has cached at the verify call. It also orients itself from a bare prompt rather than from the build context. That bias is structural, not noise. More forks would not remove it.

## What this means for L3.1

- Forks are a usable proxy only for the subagent side of verify (review-branch, fix-review) and at 44% of a full cell's cost. Restricting the metric to subagents was not the pre-set test, so this run does not establish that.
- (c) and (d) are degenerate: no fix loop and every hidden test passed in both arms. The data cannot tell a fork that drifts on these from one that does not. Checking fix-loop agreement needs a fixture where the fix loop fires in a known share of full cells.
- The $1-per-fork reservation in `checkpoint-fork.mjs` is about 4x a fork's actual cost (max $0.312). That reservation, not the money spent, cut the arm to 8 forks.

## Spend

Full arm $3.0435 + forks $2.126 = **$5.170** of the $6.00 cap.

## Reproduce

Run data under `.worktrees/l31-keep-repo/.exo/l31/` (`full/`, `keep/`, `forks/`, `full.log`, `forks.log`). Comparison: `node benchmarks/checkpoint-fork.mjs --analyse --full-runs .exo/l31/full --out .exo/l31/forks`.
