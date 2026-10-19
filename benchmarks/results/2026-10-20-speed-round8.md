# Build speed round 8: flow-unit baseline after the truncate fixture fix, n=15

A baseline round, no candidate. It measures the flow-unit cell on main `82ae8607`, the first round after the fixture fix that defines `truncate` for `max < 3`. Main question: did the review repair loop (fix-review dispatch) stop? Round 7's "Cause" section (`2026-10-19-speed-round7.md`) traces that loop to the fixture plan leaving `max < 3` undefined.

## Method

- Arm new: main `82ae8607`, detached worktree `.worktrees/ab8-base`. Arm old: round 7 base, main `8d4e6207`, worktree `.worktrees/ab7-base` (data from round 7, not rerun).
- Command: `node benchmarks/sweep.mjs --set flow --cells flow-unit --repeat 15 --concurrency 5 --confirm --out benchmarks/runs/2026-10-20-ab8-base --results /tmp/exo-ab8/base`. 15 `claude -p` calls (claude-sonnet-5-5, effort high, review-branch on opus), $8.96 total.
- Counts: `.exo/speed8/scripts/ab8.mjs` (copy of `ab7.mjs`, arms old and new; output `.exo/speed8/ab8.txt`). Tests: exact two-sided Mann-Whitney and bootstrap 95% CI (10k resamples) of the mean difference, from `.exo/speed-profile/scripts/stats.mjs`, as in rounds 6 and 7. The script's hidden count is hardcoded to 17, so hidden totals below come from each cell's `record.json` (`hiddenPass`, `defects`), not from `ab8.mjs`.
- Leak check (cache copy, other arm, main checkout in transcripts): 0 hits in both arms.

## What differs from round 7 base

This is not a clean fixture-only comparison. `git log --oneline 8d4e6207..82ae8607`:

```
82ae8607 fix(benchmarks): define truncate below max 3 in the flow fixture
0a3948fd docs(benchmarks): point rejected speed ideas at their results files
55b99eea docs(benchmarks): record build-task boundary-test line rejected at n=15
```

The diff touches only `benchmarks/sweep-fixtures.mjs`, `benchmarks/flow-hidden/truncate.test.js`, `benchmarks/speed-ledger.md`, the round 7 results file and `CHANGELOG.md`; no skill, agent or script exo runs changed. Still, the new run differs from round 7 base by the fixture fix (plan line plus one hidden test) and by these docs commits, and also by conditions: round 7 ran two arms at once with 10 cells in flight, round 8 ran 5 cells in flight, on another day. A wall or cost shift is not attributable to the fixture fix alone.

## Per arm: mean (sd)

| metric | old (`8d4e6207`) | new (`82ae8607`) |
|---|---|---|
| wall s | 189.9 (42.0) | 136.6 (25.4) |
| wall median s | 184.2 | 129.6 |
| cost $ | 0.607 (0.081) | 0.598 (0.075) |
| tokens | 234559 | 233136 |
| tokens excl. review and fix | 205871 | 206275 |
| lead calls | 15.5 | 15.5 |
| run-unit calls | 10.1 | 9.9 |
| run-unit wall s | 91.8 | 63.7 |
| hidden passed | 255/255 (17 per cell) | 270/270 (18 per cell) |
| tasks landed | 60/60 | 60/60 |
| review-branch / fix-review calls | 18 / 3 | 16 / 2 |
| runs with fix-review | 3 of 15 | 2 of 15 |

The hidden suite gained one truncate test (`benchmarks/flow-hidden/truncate.test.js` now holds 6 tests, suite 18), so totals differ: 17 per cell in the old arm, 18 in the new. All 15 new cells have `hiddenPass` true and no defects. All exit codes 0, no timeouts.

## New vs old

| | mean / median change | MW p, 95% CI |
|---|---|---|
| wall s | -28.1% / -29.6% (-53.3 s) | 7.1e-5, [-78.9, -30.9] |
| cost $ | -1.6% (-0.010) | 0.62, [-0.064, +0.043] |
| tokens | -0.6% | 0.77, [-19595, +16490] |
| run-unit wall s | -30.6% (-28.1 s) | 8.6e-7, [-33.8, -21.8] |
| lead calls | -0.07 | 0.96, [-1.5, +1.4] |
| run-unit calls | -0.27 | 0.44, [-0.87, +0.33] |

Wall is lower with the rank test and CI both excluding zero; cost is unchanged within noise. The wall gain sits in run-unit wall (64 s vs 92 s), not in lead or run-unit call counts, and only 2 vs 3 runs had a repair loop, which by itself cannot explain a 53 s mean shift. The confounds above (concurrency 5 vs 10, another day) are a plausible share of it. Treat the wall drop as a new level, not as an effect of the fixture fix.

## Repair loop

- Old arm: fix-review in runs 8, 10 and 13 (3 of 15); all three findings named `max < 3` (round 7).
- New arm: fix-review in runs 6 and 10 (2 of 15). Neither names `max < 3`; the loop caused by the undefined case did not recur. 2 of 15 is still not zero, and the difference from 3 of 15 is not testable at this n.
- Run 6 (cell `flow-unit-6`, transcript `0af8f961-8b14-4a07-a02e-449cd1a6b5ec.jsonl`, subagents dir of the same name): the reviewer (`agent-aa99cfdda83858835.jsonl` L45 writes the findings, L53 returns `defect=0 concern=1 question=0 fix=0`) raised one `concern` on `src/initials.test.js:5-8`: the "whitespace-separated" split is tested only with spaces, so a regression to `split(' ')` would pass; it suggested a tab or newline case. Not about `truncate`. The fixer (`agent-afa14da582ee46d8c.jsonl`) added that test, saw it pass (L69), removed it and marked the finding `reported: unproven` (L65, L69); result `fixed=0 reported=1` (L83).
- Run 10 (cell `flow-unit-10`, transcript `0eeb740c-f9e6-4473-a669-0c636d8a2bde.jsonl`): the reviewer (`agent-aaf4c904eb9e2d6ad.jsonl` L45 findings, L52 returns `concern=1 fix=0`) raised a style `concern` on `src/truncate.js:2-3`: guard and `throw` share one line and the main path is a ternary (standards 7 and 11, no compact one-liners). This is the defined `RangeError` guard written compactly, not a disagreement about behavior. The fixer (`agent-a5c65223b430702bc.jsonl` L104) rewrote it, `fixed=1`; a fix-diff review (`agent-ac2a52fe8ae24cb78.jsonl` L49, `concern=1 fix=1`) followed, which is why this run has 2 review-branch calls and the highest cost of the arm ($0.781, 205 s).
- Both loops are style or test-strength concerns a reviewer can raise on any plan. No loop in the new arm traces to the plan leaving a case open.

## Result

Baseline, no landing rule. The fixture fix removed the `max < 3` loop: 0 of 15 new runs have a finding about it, against 3 of 15 before. The repair loop is not gone: 2 of 15 runs still dispatch fix-review, for unrelated concerns.

## Baseline for later rounds

Compare later flow-unit rounds against these numbers (main `82ae8607`, n=15, concurrency 5, 18 hidden tests):
- wall 136.6 s mean (sd 25.4), median 129.6 s
- cost $0.598 mean (sd 0.075)
- tokens 233136; run-unit wall 63.7 s; lead calls 15.5; run-unit calls 9.9
- hidden 270/270, landed 60/60
- fix-review in 2 of 15 runs

Round 7 numbers (wall 189.9 s, cost $0.607, 17 hidden tests) are not the baseline any more. A later round should run its base arm again, at the same concurrency as its candidate arm, because this baseline's level shift is not explained.

## Caveats

- n=15 per arm, one cell, one plan, one model.
- The old arm is round 7's data, not a fresh run, so the two arms differ in time, load and concurrency as well as in commits.
- Loop causes come from reading the review findings in the transcripts, not a classifier.
- Raw data (untracked): `.worktrees/ab8-base/benchmarks/runs/2026-10-20-ab8-base`, `.worktrees/ab7-base/benchmarks/runs/2026-10-19-ab7-base`; derived `.exo/speed8/{ab8.txt,scripts/ab8.mjs}`; sweep log `/tmp/exo-ab8/sweep.log`.
