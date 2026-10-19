# Build speed round 2: flow-unit, review kind and script fan-out vs base, n=5

Tests two far-apart speed ideas against [the n=3 rerun](2026-10-19-build-speed-rerun.md)'s fixes, with review stages pinned by `19d26293`, stage counts recorded by `9e985b01` and each cell held to its own worktree's plugin by `c087a7aa`.

## Method

- Arm base: `c087a7aa`. Arm kind: `4d75992a` = base + verify dispatches the reviewer kind `verify.mjs` prints, not always `review-deep` (`skills/verify/SKILL.md` only). Arm fanout: `c6e72ff0` = base + `next-task.mjs --slots` creates the wave's slot worktrees and prints their dispatch lines (`next-task.mjs`, `land-slot.mjs`, `agents/run-unit.md`, `rolling-window.md`, test). `pluginDirty` false in every arm's `meta.json`.
- `node benchmarks/sweep.mjs --set flow --cells flow-unit --repeat 5 --concurrency 3 --confirm` in each arm's own worktree, all three arms at once, 15 `claude -p` calls (claude-sonnet-5-5, effort high), $9.86 in total. No timeout, no hang.
- Counts: `.exo/speed/ab2/count.mjs` (not tracked, as in the rerun), `benchmarks/flow-report.mjs`, `benchmarks/split.mjs`, record.json `reviewStages` and `tokensExReview`. Reviewer kind from the lead's `exo:review-branch` prompts and each subagent's `meta.json`; wave parallelism from build-task transcript timestamps.
- Tests: exact two-sided Mann-Whitney (all 252 splits) and bootstrap 95% CI (10k resamples) of the mean difference.
- Plugin leak check: 0 transcript references to `~/.claude/plugins/cache` in all 15 runs, every run read its own worktree's skills.

## Per run

| run | wall s | cost $ | tokens | tokens excl. review+fix | review-branch | fix-review | reviewer | lead calls | run-unit calls | run-unit wall s | hidden | landed |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| base-1 | 256.7 | 0.861 | 320772 | 257318 | 2 | 1 | opus/high | 20 | 15 | 84 | 17/17 | 4/4 |
| base-2 | 225.0 | 0.620 | 238535 | 217276 | 1 | 0 | opus/high | 16 | 14 | 119 | 17/17 | 4/4 |
| base-3 | 174.4 | 0.642 | 252630 | 227860 | 1 | 0 | opus/high | 20 | 15 | 80 | 17/17 | 4/4 |
| base-4 | 191.1 | 0.637 | 244804 | 220694 | 1 | 0 | opus/high | 15 | 16 | 94 | 17/17 | 4/4 |
| base-5 | 145.4 | 0.601 | 228401 | 200193 | 1 | 0 | opus/high | 15 | 16 | 74 | 17/17 | 4/4 |
| kind-1 | 271.7 | 0.818 | 322642 | 271271 | 2 | 1 | opus/medium | 24 | 16 | 142 | 17/17 | 4/4 |
| kind-2 | 139.7 | 0.617 | 242529 | 215688 | 1 | 0 | opus/medium | 16 | 14 | 72 | 17/17 | 4/4 |
| kind-3 | 253.0 | 0.792 | 316015 | 258216 | 2 | 1 | opus/medium | 22 | 17 | 81 | 17/17 | 4/4 |
| kind-4 | 148.2 | 0.594 | 229494 | 205012 | 1 | 0 | opus/medium | 15 | 13 | 67 | 17/17 | 4/4 |
| kind-5 | 163.1 | 0.596 | 231952 | 208252 | 1 | 0 | opus/medium | 12 | 17 | 85 | 17/17 | 4/4 |
| fanout-1 | 141.7 | 0.649 | 251016 | 221686 | 1 | 0 | opus/high | 17 | 14 | 73 | 17/17 | 4/4 |
| fanout-2 | 209.0 | 0.649 | 250125 | 219138 | 1 | 0 | opus/high | 19 | 14 | 107 | 17/17 | 4/4 |
| fanout-3 | 190.7 | 0.564 | 224861 | 206843 | 1 | 0 | opus/high | 14 | 15 | 111 | 17/17 | 4/4 |
| fanout-4 | 173.1 | 0.627 | 241759 | 215120 | 1 | 0 | opus/high | 16 | 14 | 77 | 17/17 | 4/4 |
| fanout-5 | 161.4 | 0.595 | 232874 | 210439 | 1 | 0 | opus/high | 16 | 13 | 85 | 17/17 | 4/4 |

## Per arm: mean (sd)

| metric | base | kind | fanout |
|---|---|---|---|
| wall s | 198.5 (43.4) | 195.1 (62.3) | 175.2 (26.0) |
| cost $ | 0.672 (0.107) | 0.683 (0.112) | 0.617 (0.037) |
| tokens | 257028 | 268526 | 240127 |
| tokens excl. review+fix | 224668 | 231688 | 214645 |
| run-unit calls | 15.2 | 15.4 | 14.0 |

## Candidate vs base

| | wall mean / median | wall MW p, 95% CI (s) | cost mean | cost 95% CI ($) | hidden |
|---|---|---|---|---|---|
| kind | -1.7% / -14.6% | 0.84, [-61, +56] | +1.7% | [-0.117, +0.132] | equal |
| fanout | -11.7% / -9.4% | 0.31, [-63, +15] | -8.3% | [-0.157, +0.015] | equal |

## Result

- Neither idea landed: their code stays on branches `speed/review-kind` and `speed/fan-out`, not on main.
- Rule: an idea lands only if wall time is lower with the CI or rank test supporting it, cost is not higher beyond noise and hidden tests are no worse.
- Kind: no measured gain. The light reviewer ran in 5 of 5 runs (opus/medium; base and fanout ran `review-deep`, opus/high, every time), but it raised fix findings in 2 of 5 runs against 1 of 5 in base, and each fix loop outweighs the lighter review.
- Fanout: no measured gain. Run-unit made no slot worktree by hand and called 1.2 fewer tools (CI [-2.0, -0.4]); wall and cost fell on the mean with CIs crossing 0, and run-unit wall did not change.
- Wave tasks ran concurrently in all 15 runs (up to 3 build-tasks at once). Quality at ceiling: hidden 17/17 and landed 4/4 in every run.

## Caveats

- n=5 per arm, one cell, one plan, one model. With wall sd 26-62 s, only a wall effect near 90-130 s (about half a run) is detectable at 80% power; a 10-15% gain is not.
- Review stages still follow the data: one base, two kind and no fanout run hit a fix finding and ran fix-review plus a second review-branch. Stage-matched runs only: kind wall -18% (n=3 v 4, p=0.23), fanout -5% (p=0.56).
- Kind and fanout are both worktree commits on `c087a7aa`, not on `main`.
