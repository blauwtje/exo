# Build speed round 3: flow-unit, script fan-out vs base, n=15

Reruns [round 2](2026-10-19-speed-round2.md)'s fanout arm at n=15 per arm, since n=5 could not detect a 10-15% gain, on main `71a42460` (review stages pinned, run-unit held to its own plugin).

## Method

- Arm base: `71a42460` (main). Arm fanout: `6573ab06` = base + cherry-pick of `6a2f5c86`, `next-task.mjs --slots` creates the wave's slot worktrees and prints their dispatch lines. `pluginDirty` false in both arms' `meta.json`.
- `node benchmarks/sweep.mjs --set flow --cells flow-unit --repeat 15 --concurrency 5 --confirm` in each arm's own worktree, both arms at once (10 cells in flight), 30 `claude -p` calls (claude-sonnet-5-5, effort high), $19.94 in total ($9.84 base, $10.11 fanout). No timeout, no hang, no failed or missing cell.
- Counts: `.exo/speed/ab2/count.mjs` (not tracked, as in round 2), `benchmarks/flow-report.mjs`, `benchmarks/split.mjs`, record.json `reviewStages` and `tokensExReview`. Reviewer kind from each subagent's `meta.json`; wave parallelism and phase times from transcript timestamps.
- Tests: exact two-sided Mann-Whitney (rank-sum distribution over all C(30,15) splits) and bootstrap 95% CI (10k resamples) of the mean difference.
- Plugin leak check: 0 transcript references to `~/.claude/plugins/cache` in all 30 runs, 0 to the other arm's worktree or the main checkout; every run read its own worktree's skills. Fanout run-units called `next-task.mjs --slots` in 15 of 15 runs and made no slot worktree by hand; base run-units ran `git worktree add` in 14 of 15.

## Per run

| run | wall s | cost $ | tokens | tokens excl. review+fix | review-branch | fix-review | reviewer | lead calls | run-unit calls | run-unit wall s | hidden | landed |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| base-1 | 255.9 | 1.019 | 343805 | 244630 | 2 | 1 | opus/high | 20 | 13 | 61 | 17/17 | 4/4 |
| base-2 | 170.0 | 0.613 | 244654 | 224275 | 1 | 0 | opus/high | 18 | 16 | 90 | 17/17 | 4/4 |
| base-3 | 139.6 | 0.593 | 229081 | 204552 | 1 | 0 | opus/high | 16 | 15 | 65 | 17/17 | 4/4 |
| base-4 | 156.6 | 0.606 | 236457 | 215217 | 1 | 0 | opus/high | 16 | 16 | 86 | 17/17 | 4/4 |
| base-5 | 198.4 | 0.673 | 254826 | 224941 | 1 | 0 | opus/high | 18 | 15 | 99 | 17/17 | 4/4 |
| base-6 | 198.7 | 0.599 | 226338 | 201282 | 1 | 0 | opus/high | 16 | 15 | 121 | 17/17 | 4/4 |
| base-7 | 209.3 | 0.650 | 250444 | 222282 | 1 | 0 | opus/high | 17 | 16 | 104 | 17/17 | 4/4 |
| base-8 | 126.3 | 0.600 | 237013 | 217084 | 1 | 0 | opus/high | 18 | 16 | 66 | 17/17 | 4/4 |
| base-9 | 148.2 | 0.619 | 243421 | 220832 | 1 | 0 | opus/high | 20 | 13 | 69 | 17/17 | 4/4 |
| base-10 | 197.4 | 0.599 | 241571 | 221825 | 1 | 0 | opus/high | 19 | 16 | 99 | 17/17 | 4/4 |
| base-11 | 189.0 | 0.656 | 252875 | 227600 | 1 | 0 | opus/high | 18 | 17 | 94 | 17/17 | 4/4 |
| base-12 | 239.5 | 0.581 | 227821 | 203221 | 1 | 0 | opus/high | 17 | 13 | 167 | 17/17 | 4/4 |
| base-13 | 159.3 | 0.586 | 230088 | 209443 | 1 | 0 | opus/high | 16 | 15 | 78 | 17/17 | 4/4 |
| base-14 | 198.7 | 0.624 | 236752 | 209699 | 1 | 0 | opus/high | 14 | 17 | 111 | 17/17 | 4/4 |
| base-15 | 268.3 | 0.820 | 305373 | 244845 | 2 | 1 | opus/high | 19 | 15 | 109 | 17/17 | 4/4 |
| fanout-1 | 221.6 | 0.589 | 227736 | 202649 | 1 | 0 | opus/high | 16 | 15 | 128 | 17/17 | 4/4 |
| fanout-2 | 168.0 | 0.628 | 242813 | 217715 | 1 | 0 | opus/high | 16 | 14 | 80 | 17/17 | 4/4 |
| fanout-3 | 237.6 | 0.604 | 220143 | 186334 | 1 | 0 | opus/high | 13 | 13 | 146 | 17/17 | 4/4 |
| fanout-4 | 252.2 | 0.854 | 314064 | 245922 | 2 | 1 | opus/high | 22 | 13 | 82 | 17/17 | 4/4 |
| fanout-5 | 176.6 | 0.559 | 219521 | 199467 | 1 | 0 | opus/high | 17 | 13 | 82 | 17/17 | 4/4 |
| fanout-6 | 196.5 | 0.620 | 236280 | 208217 | 1 | 0 | opus/high | 15 | 16 | 117 | 17/17 | 4/4 |
| fanout-7 | 182.6 | 0.683 | 266939 | 227872 | 1 | 1 | opus/high | 16 | 14 | 76 | 17/17 | 4/4 |
| fanout-8 | 204.0 | 0.594 | 229293 | 208540 | 1 | 0 | opus/high | 16 | 14 | 107 | 17/17 | 4/4 |
| fanout-9 | 202.0 | 0.601 | 227903 | 199887 | 1 | 0 | opus/high | 15 | 14 | 119 | 17/17 | 4/4 |
| fanout-10 | 198.3 | 0.580 | 220106 | 193540 | 1 | 0 | opus/high | 13 | 15 | 97 | 17/17 | 4/4 |
| fanout-11 | 313.9 | 0.858 | 324634 | 264917 | 2 | 1 | opus/high | 24 | 14 | 106 | 17/17 | 4/4 |
| fanout-12 | 368.2 | 0.830 | 305614 | 243651 | 2 | 1 | opus/high | 24 | 13 | 186 | 17/17 | 4/4 |
| fanout-13 | 278.7 | 0.869 | 340601 | 285523 | 2 | 1 | opus/high | 28 | 14 | 97 | 17/17 | 4/4 |
| fanout-14 | 234.9 | 0.622 | 247613 | 225376 | 1 | 0 | opus/high | 16 | 19 | 136 | 17/17 | 4/4 |
| fanout-15 | 327.6 | 0.612 | 233756 | 208861 | 1 | 0 | opus/high | 17 | 15 | 103 | 17/17 | 4/4 |

## Per arm: mean (sd)

| metric | base | fanout |
|---|---|---|
| wall s | 190.3 (41.7) | 237.5 (60.0) |
| cost $ | 0.656 (0.116) | 0.674 (0.115) |
| tokens | 250701 | 257134 |
| tokens excl. review+fix | 219449 | 221231 |
| run-unit calls | 15.2 | 14.4 |
| run-unit wall s | 94.6 | 110.8 |

## Candidate vs base

| | wall mean / median | wall MW p, 95% CI (s) | cost mean | cost 95% CI ($) | hidden |
|---|---|---|---|---|---|
| fanout | +24.8% / +12.3% | 0.037, [+12, +84] | +2.7% | [-0.064, +0.093] | equal |

## Result

- Fan-out did not land: its code stays on branch `speed/fan-out`, not on main.
- Rule: an idea lands only if wall time is lower with the CI or rank test supporting it, cost is not higher beyond noise and hidden tests are no worse.
- Fanout: slower, and the difference holds up. Wall rose 47 s on the mean (CI [+12, +84], p=0.037); cost did not change beyond noise. Run-unit called 0.8 fewer tools (p=0.047, CI [-1.7, +0.3]), but its wall rose 16 s (CI [-3, +36]).
- The extra wall time comes from three places: run-unit span +16 s, the review phase +17 s (fanout ran 5 fix-reviews and 4 second reviews, base 2 and 2; Fisher p=0.39), and the gap before review +12 s, most of it one 2-minute lead turn in fanout-15 in verify, not in fan-out code.
- Wave tasks ran concurrently in 27 of 30 runs (up to 3 build-tasks at once); base-12, fanout-3 and fanout-12 ran them one at a time. Quality at ceiling: hidden 17/17 and landed 4/4 in every run.

## Caveats

- n=15 per arm, one cell, one plan, one model. With wall sd 42-60 s, a wall effect of about 50 s (25%) is detectable at 80% power; a 10% gain is not.
- Review stages still follow the data. Stage-matched runs only (1 review-branch, 0 fix-review, n=13 v 10): fanout wall +21% (+37 s, p=0.049, CI [+9, +71]), cost -2.3% (CI [-0.034, +0.004]), tokens excl. review+fix -4.9% (CI [-18.5k, -2.4k]).
- Pooled with round 2 (secondary, different base commit `c087a7aa`, same code apart from docs; n=20 v 20): fanout wall +15% (p=0.16, CI [-1, +62]), cost -0.1% (CI [-0.069, +0.063]). Round 2's -12% did not replicate.
- Fanout is a cherry-pick on `71a42460`, not on `main`.
- Both arms ran at the same time with 10 concurrent cells; base finished first, so fan-out's last 2-3 cells ran under lighter load, which would favor fan-out, not explain its slowdown.
- Raw data (untracked, kept): `.worktrees/ab4-<arm>/benchmarks/runs/2026-10-19-ab4-<arm>`.
