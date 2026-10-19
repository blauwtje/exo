# Build speed round 4: flow-unit, parallel-tool-call line vs base, n=15

Tests the ledger idea "Parallel-tool-call line in agent prompts" at n=15 per arm, on main `6a7d8012`.

## Method

- Arm base: `6a7d8012` (main). Arm par: `01bfbeb6` = base + one line, "Independent tool calls → one message, together.", in `agents/run-unit.md`, `agents/build-task.md`, `agents/review-branch.md` and `skills/build/references/run-loop.md` (the lead's build rules). `pluginDirty` false in both arms' `meta.json`.
- `node benchmarks/sweep.mjs --set flow --cells flow-unit --repeat 15 --concurrency 5 --confirm --out benchmarks/runs/2026-10-19-ab5-<arm> --results <dir outside the tree>` in each arm's own worktree, both arms at once (10 cells in flight), 30 `claude -p` calls (claude-sonnet-5-5, effort high, claude 2.1.303), $19.35 in total ($10.12 base, $9.23 par). No timeout, no hang, no failed or missing cell.
- Counts: `.exo/speed-profile/scripts/count.mjs` (the round 3 counter plus tool-call batching; not tracked), `ab5.mjs` for the table and tests, `matched.mjs` for stage-matched runs. Batching: a batch is one assistant message (one message id) holding 2 or more `tool_use` blocks; a serial read-only pair is two consecutive single-call turns that are both Read, Grep, Glob or a read-only Bash command (cat, ls, grep, git status, log, diff, show and the like), a crude proxy for serial independent calls.
- Tests: exact two-sided Mann-Whitney (rank-sum distribution over all C(30,15) splits, midranks) and bootstrap 95% CI (10k resamples) of the mean difference.
- Plugin leak check: 0 transcript files out of 115 (base) and 109 (par) reference `~/.claude/plugins/cache`, 0 reference the other arm's worktree, 0 reference a skill, agent, lib or hook path in the main checkout.

## Confound

The par arm differs from base by more than the line. Three agent bodies sat within 50 bytes of the 750-token body ceiling, so `01bfbeb6` also trims wording to stay under it:

- `build-task`: drops "Never create a worktree, " (the first Git bullet now reads "Never enter or leave a worktree"; `worktree` stays in the banned writing-git list), drops `commit` from that list (only `land-task.mjs` commits stays), "never `Monitor`, never start with `sleep`" becomes "never `Monitor` or a leading `sleep`", and three article or pronoun cuts.
- `run-unit`: "next task" to "next", "if SendMessage is unavailable" to "if unavailable", ", so step 1" to "; step 1", "two or three options" to "2-3 options".
- `review-branch`: "each on one line, no heading per finding" to "one line each, no heading".

These trims are not rule-neutral, and the par arm measures line plus trims together. Checked in the transcripts: none of the 60 par `build-task` agents (61 base) ran a `git worktree` or `git commit` command, so the dropped rules did not show as a violation here.

## Per run

| run | wall s | cost $ | tokens | tokens excl. review+fix | review-branch | fix-review | lead calls | run-unit calls | run-unit wall s | hidden | landed |
|---|---|---|---|---|---|---|---|---|---|---|---|
| base-1 | 232.2 | 0.610 | 248474 | 231975 | 1 | 0 | 18 | 17 | 131 | 17/17 | 4/4 |
| base-2 | 313.4 | 0.735 | 281347 | 234968 | 1 | 1 | 17 | 13 | 128 | 17/17 | 4/4 |
| base-3 | 195.3 | 0.625 | 242231 | 216576 | 1 | 0 | 18 | 15 | 103 | 17/17 | 4/4 |
| base-4 | 258.6 | 0.568 | 226968 | 206061 | 1 | 0 | 17 | 12 | 180 | 17/17 | 4/4 |
| base-5 | 243.7 | 0.605 | 235729 | 214970 | 1 | 0 | 19 | 13 | 134 | 17/17 | 4/4 |
| base-6 | 307.8 | 0.854 | 330327 | 276696 | 2 | 1 | 22 | 16 | 146 | 17/17 | 4/4 |
| base-7 | 211.2 | 0.787 | 296608 | 241228 | 2 | 1 | 19 | 15 | 76 | 17/17 | 4/4 |
| base-8 | 129.5 | 0.607 | 235920 | 211123 | 1 | 0 | 16 | 15 | 63 | 17/17 | 4/4 |
| base-9 | 292.7 | 0.808 | 313386 | 259971 | 2 | 1 | 22 | 16 | 111 | 17/17 | 4/4 |
| base-10 | 209.2 | 0.594 | 232830 | 209444 | 1 | 0 | 18 | 13 | 110 | 17/17 | 4/4 |
| base-11 | 219.2 | 0.626 | 241897 | 217121 | 1 | 0 | 16 | 15 | 119 | 17/17 | 4/4 |
| base-12 | 216.4 | 0.615 | 238912 | 217393 | 1 | 0 | 15 | 16 | 122 | 17/17 | 4/4 |
| base-13 | 222.8 | 0.836 | 320807 | 262359 | 2 | 1 | 24 | 16 | 82 | 17/17 | 4/4 |
| base-14 | 162.8 | 0.627 | 247663 | 222346 | 1 | 0 | 20 | 13 | 75 | 17/17 | 4/4 |
| base-15 | 181.1 | 0.624 | 240931 | 214060 | 1 | 0 | 17 | 15 | 97 | 17/17 | 4/4 |
| par-1 | 266.1 | 0.689 | 274293 | 233827 | 1 | 1 | 19 | 13 | 108 | 17/17 | 4/4 |
| par-2 | 195.6 | 0.573 | 229028 | 210394 | 1 | 0 | 16 | 16 | 129 | 17/17 | 4/4 |
| par-3 | 204.0 | 0.556 | 216109 | 196020 | 1 | 0 | 14 | 14 | 110 | 17/17 | 4/4 |
| par-4 | 197.6 | 0.582 | 225804 | 203119 | 1 | 0 | 15 | 12 | 111 | 17/17 | 4/4 |
| par-5 | 129.6 | 0.600 | 225363 | 197320 | 1 | 0 | 12 | 13 | 59 | 17/17 | 4/4 |
| par-6 | 198.0 | 0.704 | 276176 | 232570 | 1 | 1 | 20 | 15 | 75 | 17/17 | 4/4 |
| par-7 | 196.5 | 0.578 | 221736 | 199304 | 1 | 0 | 13 | 14 | 107 | 17/17 | 4/4 |
| par-8 | 195.1 | 0.582 | 229187 | 208510 | 1 | 0 | 15 | 14 | 95 | 17/17 | 4/4 |
| par-9 | 245.6 | 0.620 | 233376 | 207886 | 1 | 0 | 16 | 15 | 132 | 17/17 | 4/4 |
| par-10 | 247.1 | 0.596 | 231132 | 207457 | 1 | 0 | 14 | 11 | 158 | 17/17 | 4/4 |
| par-11 | 206.0 | 0.571 | 226507 | 206546 | 1 | 0 | 17 | 14 | 123 | 17/17 | 4/4 |
| par-12 | 215.6 | 0.548 | 244793 | 221530 | 1 | 0 | 19 | 15 | 109 | 17/17 | 4/4 |
| par-13 | 331.8 | 0.841 | 316781 | 259072 | 2 | 1 | 22 | 15 | 158 | 17/17 | 4/4 |
| par-14 | 200.3 | 0.579 | 227524 | 207663 | 1 | 0 | 14 | 15 | 121 | 17/17 | 4/4 |
| par-15 | 206.2 | 0.613 | 235633 | 211923 | 1 | 0 | 16 | 14 | 108 | 17/17 | 4/4 |

## Per arm: mean (sd)

| metric | base | par |
|---|---|---|
| wall s | 226.4 (51.5) | 215.7 (44.5) |
| cost $ | 0.675 (0.099) | 0.616 (0.076) |
| tokens | 262269 | 240896 |
| tokens excl. review+fix | 229086 | 213543 |
| lead calls | 18.5 | 16.1 |
| run-unit calls | 14.7 | 14.0 |
| run-unit wall s | 111.8 | 113.6 |
| hidden passed | 255/255 | 255/255 |
| tasks landed | 60/60 | 60/60 |
| review-branch runs / fix-review runs | 19 / 5 | 16 / 3 |
| runs with a second review | 4 | 1 |

## Candidate vs base

| | wall mean / median | wall MW p, 95% CI (s) | cost mean | cost MW p, 95% CI ($) | hidden |
|---|---|---|---|---|---|
| par | -4.7% / -6.9% | 0.389, [-43.3, +23.4] | -8.8% | 0.016, [-0.121, +0.0005] | equal |

## Behavior change

- Batched turns (a message with 2 or more tool calls) as share of turns, base to par: run-unit 18.8% to 16.7% (35 to 30 batch turns), build-task 37.4% to 38.8% (170 to 170), review-branch 11.2% to 18.2% (12 to 14), lead 17.5% to 13.7% (48 to 34).
- Serial read-only pairs: run-unit 2 to 4, build-task 25 to 18, review-branch 12 to 0, lead 5 to 5.
- `build-task`, where most calls happen (564 calls base, 548 par), batched exactly as often with and without the line: models already parallelize there. Only `review-branch` batches more, and its count is mixed with the number of reviews (19 base, 16 par, so fewer second reviews, which are shorter and read less). The line changed little in `run-unit` and the lead.

## Result

- Rejected under the rule: an idea lands only if wall time is lower with the CI or rank test supporting it, cost is not higher beyond noise and hidden tests are no worse.
- Wall: par is 10.7 s lower on the mean (-4.7%), but the CI spans zero and the rank test does not support it (p=0.389). Stage-matched runs (1 review-branch, 0 fix-review, n=10 v 12): wall -0.7%, p=0.77, CI [-28.7, +26.0].
- Cost: -8.8% (p=0.016, CI [-0.121, +0.0005]) and tokens -8.1% (p=0.0075). Most of it follows the review stages: base had 5 fix-reviews and 4 second reviews, par 3 and 1. Stage-matched: cost -4.4% (p=0.009, CI [-0.042, -0.011]), tokens excl. review+fix -4.5% (p=0.004), lead calls -13.3% (p=0.005). A lead-side saving of this size is not explained by the line, which changed lead batching little, so it may be noise, the trims, or an effect without a mechanism seen here.
- Quality at ceiling in both arms: hidden 17/17 and landed 4/4 in all 30 runs.

## Caveats

- n=15 per arm, one cell, one plan, one model. With wall sd 44-51 s, a wall effect of about 45 s (20%) is detectable at 80% power; a 5% gain is not, so a small real gain is not excluded.
- Review stages still follow the data, not the arm; the cost and token differences depend on how many runs hit a fix loop.
- The confound above: the par arm includes wording trims.
- The serial-pair count is a heuristic, not a dependency analysis.
- Both arms ran at the same time with 10 concurrent cells.
- Raw data (untracked, kept): `.worktrees/ab5-<arm>/benchmarks/runs/2026-10-19-ab5-<arm>`.
