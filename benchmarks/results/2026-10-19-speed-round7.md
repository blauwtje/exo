# Build speed round 7: flow-unit, build-task boundary tests vs base, n=15

Tests "`build-task` tests every boundary a `Data:` line implies" at n=15 per arm, on main `8d4e6207`.

## Method

- Arm base: `8d4e6207` (main). Arm edge: `bbe2971a` (branch `speed/edge-tests`) = base + `agents/build-task.md` line telling the builder to test each limit a `Data:` line implies. Detached worktrees `.worktrees/ab7-base` and `.worktrees/ab7-edge`.
- Same method as round 6: `node benchmarks/sweep.mjs --set flow --cells flow-unit --repeat 15 --concurrency 5 --confirm --out benchmarks/runs/2026-10-19-ab7-<arm> --results /tmp/exo-ab7/<arm>` in each arm's worktree, both at once (10 cells in flight, started 20:48 UTC). 30 `claude -p` calls (claude-sonnet-5-5, effort high, review-branch on opus), $18.31 ($9.11 base, $9.20 edge), under the $38.73 left of the cap.
- Counts: `.exo/speed7/scripts/ab7.mjs` (copy of `ab6.mjs`, arms base and edge). Tests: exact two-sided Mann-Whitney (midranks, all C(30,15) splits) and bootstrap 95% CI (10k resamples) of the mean difference, from `.exo/speed-profile/scripts/stats.mjs`.
- Repair loop = runs with a fix-review call; cause read by grepping `max < 3` in those runs' transcripts.

## Harness fault

Cell edge-2: the `claude` process wrote its last transcript line (stop hook) at 20:51:48, 210 s after start, then never exited and `stdout.json` stayed empty. It was killed with SIGTERM at 21:11 (exit 143, recorded wall 1406 s). The work was complete (landed 4/4, hidden 17/17, cost $0.670 recorded from the transcript). The cell's wall is set to 210.0 s, from the transcript. Raw wall without the correction is shown for transparency. Base had no such hang. Not repeated, so not treated as a broken harness.

## Per arm: mean (sd)

| metric | base | edge |
|---|---|---|
| wall s (edge-2 corrected) | 189.9 (42.0) | 184.4 (28.3) |
| wall median s | 184.2 | 180.3 |
| cost $ | 0.607 (0.081) | 0.613 (0.062) |
| tokens | 234559 | 228986 |
| lead calls | 15.5 | 15.7 |
| run-unit calls | 10.1 | 10.3 |
| run-unit wall s | 91.8 | 86.3 |
| hidden passed | 255/255 | 255/255 |
| tasks landed | 60/60 | 60/60 |
| review-branch / fix-review runs | 18 / 3 | 16 / 3 |

## Candidate vs base

| | wall mean / median | wall MW p, 95% CI (s) | cost mean | cost MW p, 95% CI ($) | hidden |
|---|---|---|---|---|---|
| edge, edge-2 wall corrected | -2.9% / -2.1% | 0.645, [-31.7, +17.7] | +1.0% | 0.81, [-0.045, +0.055] | equal |
| edge, edge-2 dropped (n=14) | -3.9% | 0.470, [-33.3, +16.8] | | | |
| edge, raw wall with hung cell | +39.1% | 0.705, [-26.2, +247.1] | | | |

Also: tokens -2.4% (p=0.93); run-unit wall -5.5 s (p=0.089, CI [-13.0, +2.8]); lead calls +0.1 (p=0.78); run-unit calls +0.1 (p=0.60).

## Repair loop

- Base: fix-review in runs 8, 10 and 13 (3 of 15); all three review findings name `max < 3` (`slice(0, max - 3)` takes a negative end).
- Edge: fix-review in runs 6, 7 and 13 (3 of 15); all three still name `max < 3` or a negative max. The line did not stop the loop (expected 0 to 1 per 15, see the build profile's 10 of 45).

## Cause

The repair loop in edge runs 6, 7 and 13 traces to one gap: the fixture plan line (`benchmarks/sweep-fixtures.mjs:98`) leaves `max < 3` undefined, because "followed by three ASCII dots" conflicts with "exactly max characters long" and a negative max cannot be that long. Every edge builder did write a `max < 3` test, so the missing piece was the spec, not a test.
- Runs 6 and 7: the review finding is a style `concern` (standard 11, no compact one-liners) on the clamp line, not a behavior bug; the builder's test passed and the fixer marked it `reported: unproven` (run 6: builder `agent-af42b4c5819527fbd.jsonl` L42, reviewer `agent-ab9fdff9c06fd81ed.jsonl` L57, fixer `agent-a27e72c4e3347bac8.jsonl` L46; run 7: builder `agent-acdd17403aeb2daf1.jsonl` L42, reviewer `agent-acf10eb8e65db5eb9.jsonl` L62, fixer `agent-a2bfcee3b300cc9f1.jsonl` L67). The reviewer names the plan's silence: "which the plan leaves undefined".
- Run 13: the builder chose "always three dots" for max 0 and 1 and tested it (`agent-a76c3de893150a1c8.jsonl` L42); the reviewer flagged it as a defect against "exactly max characters long" (`agent-ae86c341e1a5fb85d.jsonl` L38), and fix-review ran (fixer `agent-aaf3d5f20fc737642.jsonl` L68, fixed=1).
- The hidden tests (`benchmarks/flow-hidden/truncate.test.js`) stop at max 3, so 17/17 cannot tell the choices apart.

Follow-up: this fix defines the case in the plan (`truncate` throws a `RangeError` when `max` is below 3, negative included) and adds a hidden test for max 2 and -1. Loop rates from rounds before this fix are not directly comparable with rounds after it.

## Result

Landing rule, applied literally:
- Wall lower with the CI or rank test supporting it: FAIL. -5.6 s (-2.9%), p=0.645, CI [-31.7, +17.7] spans zero.
- Cost not higher beyond noise: PASS. +1.0%, CI spans zero.
- Hidden no worse: PASS. 255/255 in both arms, landed 60/60 in both.
- Verdict: rejected. The mechanism failed: the repair loop on `max < 3` occurred as often as in base.

## Caveats

- n=15 per arm, one cell, one plan, one model; the minimum detectable wall effect is large (sd about 30 to 40 s).
- The loop cause is a grep of transcripts, not a classifier.
- Edge-2 wall is the transcript span, other cells use the harness wall (a few seconds longer).
- Both arms ran at once with 10 concurrent cells.
- Raw data (untracked): `.worktrees/ab7-<arm>/benchmarks/runs/2026-10-19-ab7-<arm>`; derived `.exo/speed7/{ab7.txt,ab7.json}`.
