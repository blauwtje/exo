# Build speed round 6: flow-unit, scripts print the next step vs base, n=15

Tests "scripts print the next step" (see Design, Option A+B) at n=15 per arm, on main `31ece02e`.

## Method

- Arm base: `31ece02e` (main). Arm print: `9b1d83ed` (branch `speed6/print`) = base + `next-task.mjs` prints the filled implementer prompt and sets up wave worktrees, so run-unit reads no reference on the happy path (A); `verify.mjs --reviews-only` and `merge-reviews.mjs` print what the lead read before dispatching and after review (B). `pluginDirty` false in both arms' `meta.json`; plugin commits are the arms' own worktrees.
- `node benchmarks/sweep.mjs --set flow --cells flow-unit --repeat 15 --concurrency 5 --confirm --out benchmarks/runs/2026-10-19-ab6-<arm> --results /tmp/exo-ab6/<arm>` in each arm's own worktree, both arms at once (10 cells in flight, both started 20:01:41 UTC; base ended 20:14:15, print 20:11:59). 30 `claude -p` calls (claude-sonnet-5-5, effort high, review-branch on opus), $19.11 ($10.37 base, $8.74 print). No timeout, no non-zero exit, no failed or missing cell.
- Counts: `.exo/speed-profile/scripts/count.mjs` via `.exo/speed6/scripts/ab6.mjs` (table, tests, leak check; copy of `ab5.mjs`) and `matched6.mjs` (stage-matched; copy of `matched.mjs`). Critical path: `extract6.mjs` (copy of `extract.mjs`, ab6 dirs only) to `raw6.json`, `critpath.mjs` to `crit6.json`, `turns.mjs` to `turns6-<arm>.json`, `mech6.mjs` (rules of `classify.mjs`, all and stage-matched runs) to `mech6.txt`. API luck: `latency6.mjs` (fit and stall rule of `stalls.mjs`) to `latency6.txt`.
- Tests: exact two-sided Mann-Whitney (rank-sum distribution over all C(30,15) splits, midranks) and bootstrap 95% CI (10k resamples) of the mean difference.
- Plugin leak check: 0 transcript files out of 116 (base) and 107 (print) reference `~/.claude/plugins/cache`, 0 reference the other arm's worktree, 0 reference a skill, agent, lib or hook path in the main checkout.

## Design

Read-only analysis of 15 base flow-unit runs (ab5-base, 52.2 critical turns, 216 s of critical model time per run) found bookkeeping turns that carry no decision:

- run-unit, between `next-task` and the wave dispatch, 3 of 9 critical turns: reading `implementer-prompt.md` plus `date +%s` (1.00 per run; a fixed 4-line template whose fields `next-task` already knows), reading `rolling-window.md` and `wave-worktrees.md` (1.00; 66 lines, the happy path uses a few), and worktree setup (about 1.0; determined by `next-task`'s `Wave:` line). A separate second `next-task` after `land-task` adds 0.13.
- lead, verify entry and exit, about 2 turns: reading `review-rules.md` and splitting `--reviews-only` from the full run, plus the plan read for the dispatch fields (about 2.0 turns together), and `cat .exo/branch-review.md` after `merge-reviews` (1.00).

Option A (run-unit): `next-task.mjs` prints `Since:` and the filled implementer prompt, opens a wave's slot worktrees (baseline, `worktree add --detach`, `.exo/`, the plan's `Worktree setup:`) and prints the wait and land commands; on failure it removes what it made and prints the old fallback. `land-task.mjs` prints the next task on LANDED. `run-unit.md` dispatches the printed prompts and reads the references only on REFUSED, CONFLICT, NEWPATH, stall or repair. Expected: about 3.1 turns and 11 s of critical time removed, about 9.7 s mean wall (4%).

Option B (lead): `verify.mjs --reviews-only` prints the review-branch dispatch fields, `merge-reviews.mjs` prints the `question`/`report` findings and the `pick-reviewer` result, and `review-rules.md` is read only on BLOCKED or resume. Expected: about 2.0 turns, 6.5 to 7 s. The lead still writes the 3 to 5 review questions from the plan.

Round 6 tests A and B together (about 5 turns, about 17 s expected), so the result cannot attribute between them. The earlier ledger entry "Script-owned fan-out" cut no run-unit turns; this change removes the reads, not just the `worktree add`.

## Per run

| run | wall s | cost $ | tokens | tokens excl. review+fix | review-branch | fix-review | lead calls | run-unit calls | run-unit wall s | hidden | landed |
|---|---|---|---|---|---|---|---|---|---|---|---|
| base-1 | 274.2 | 0.877 | 326942 | 261526 | 2 | 1 | 20 | 16 | 88 | 17/17 | 4/4 |
| base-2 | 337.1 | 0.882 | 309245 | 231158 | 2 | 1 | 17 | 13 | 108 | 17/17 | 4/4 |
| base-3 | 228.4 | 0.647 | 255306 | 231085 | 1 | 0 | 19 | 17 | 112 | 17/17 | 4/4 |
| base-4 | 256.0 | 0.611 | 239346 | 216396 | 1 | 0 | 18 | 14 | 138 | 17/17 | 4/4 |
| base-5 | 208.3 | 0.573 | 224657 | 202994 | 1 | 0 | 16 | 15 | 98 | 17/17 | 4/4 |
| base-6 | 159.9 | 0.630 | 253359 | 233354 | 1 | 0 | 19 | 15 | 84 | 17/17 | 4/4 |
| base-7 | 302.2 | 0.845 | 325894 | 271024 | 2 | 1 | 27 | 16 | 140 | 17/17 | 4/4 |
| base-8 | 326.2 | 0.762 | 272093 | 214760 | 2 | 1 | 23 | 13 | 174 | 17/17 | 4/4 |
| base-9 | 212.2 | 0.595 | 226423 | 200060 | 1 | 0 | 15 | 15 | 126 | 17/17 | 4/4 |
| base-10 | 357.2 | 0.788 | 300662 | 243900 | 2 | 1 | 23 | 13 | 171 | 17/17 | 4/4 |
| base-11 | 217.5 | 0.619 | 237178 | 210715 | 1 | 0 | 16 | 18 | 119 | 17/17 | 4/4 |
| base-12 | 172.0 | 0.530 | 229410 | 207291 | 1 | 0 | 15 | 14 | 93 | 17/17 | 4/4 |
| base-13 | 215.8 | 0.759 | 285591 | 233572 | 1 | 1 | 18 | 15 | 73 | 17/17 | 4/4 |
| base-14 | 172.2 | 0.618 | 241164 | 216862 | 1 | 0 | 16 | 17 | 97 | 17/17 | 4/4 |
| base-15 | 154.2 | 0.631 | 244203 | 220995 | 1 | 0 | 19 | 14 | 73 | 17/17 | 4/4 |
| print-1 | 162.6 | 0.510 | 241849 | 220632 | 1 | 0 | 16 | 10 | 103 | 17/17 | 4/4 |
| print-2 | 166.9 | 0.574 | 224468 | 204412 | 1 | 0 | 14 | 11 | 90 | 17/17 | 4/4 |
| print-3 | 172.0 | 0.565 | 225473 | 206770 | 1 | 0 | 15 | 9 | 93 | 17/17 | 4/4 |
| print-4 | 222.8 | 0.617 | 234696 | 208288 | 1 | 0 | 18 | 11 | 102 | 17/17 | 4/4 |
| print-5 | 204.6 | 0.598 | 228598 | 207258 | 1 | 0 | 14 | 12 | 108 | 17/17 | 4/4 |
| print-6 | 233.8 | 0.636 | 236036 | 205097 | 1 | 0 | 16 | 11 | 124 | 17/17 | 4/4 |
| print-7 | 193.8 | 0.534 | 210458 | 194305 | 1 | 0 | 14 | 11 | 114 | 17/17 | 4/4 |
| print-8 | 197.7 | 0.587 | 228744 | 206698 | 1 | 0 | 15 | 11 | 102 | 17/17 | 4/4 |
| print-9 | 225.3 | 0.601 | 209546 | 180339 | 1 | 0 | 13 | 9 | 114 | 17/17 | 4/4 |
| print-10 | 137.2 | 0.542 | 214661 | 195174 | 1 | 0 | 14 | 11 | 73 | 17/17 | 4/4 |
| print-11 | 181.8 | 0.591 | 228334 | 202874 | 1 | 0 | 17 | 10 | 97 | 17/17 | 4/4 |
| print-12 | 174.2 | 0.652 | 248971 | 210449 | 1 | 1 | 15 | 10 | 70 | 17/17 | 4/4 |
| print-13 | 183.8 | 0.565 | 224115 | 205895 | 1 | 0 | 15 | 11 | 115 | 17/17 | 4/4 |
| print-14 | 145.2 | 0.566 | 217004 | 196486 | 1 | 0 | 15 | 10 | 69 | 17/17 | 4/4 |
| print-15 | 187.9 | 0.607 | 230365 | 206502 | 1 | 0 | 15 | 12 | 108 | 17/17 | 4/4 |

## Per arm: mean (sd)

| metric | base | print |
|---|---|---|
| wall s | 239.6 (66.5) | 186.0 (28.1) |
| wall median s | 217.5 | 183.8 |
| cost $ | 0.691 (0.116) | 0.583 (0.038) |
| tokens | 264765 | 226888 |
| tokens excl. review+fix | 226379 | 203412 |
| lead calls | 18.7 | 15.1 |
| run-unit calls | 15.0 | 10.6 |
| run-unit wall s | 113.0 | 98.7 |
| hidden passed | 255/255 | 255/255 |
| tasks landed | 60/60 | 60/60 |
| review-branch runs / fix-review runs | 20 / 6 | 15 / 1 |
| runs with a second review | 5 | 0 |

## Candidate vs base

| | wall mean / median | wall MW p, 95% CI (s) | cost mean | cost MW p, 95% CI ($) | hidden |
|---|---|---|---|---|---|
| print | -22.4% / -15.5% | 0.026, [-89.7, -19.1] | -15.6% | 0.0023, [-0.171, -0.050] | equal |

Also: tokens -14.3% (p=0.0003, CI [-57.0k, -20.1k]); lead calls -3.7 (p=0.0001); run-unit calls -4.4 (p<0.0001); run-unit wall -14.2 s (p=0.29, CI [-32.0, +2.8]).

## Stage-matched (1 review-branch, 0 fix-review; n=9 base v 14 print)

| metric | base | print | diff | MW p | 95% CI |
|---|---|---|---|---|---|
| wall s | 197.9 | 186.8 | -5.6% | 0.516 | [-37.0, +14.6] |
| cost $ | 0.606 | 0.578 | -4.6% | 0.053 | [-0.055, +0.002] |
| tokens excl. review+fix | 215528 | 202909 | -5.9% | 0.013 | [-21.3k, -4.1k] |
| lead calls | 17.0 | 15.1 | -11.3% | 0.007 | [-3.2, -0.7] |
| run-unit calls | 15.4 | 10.6 | -31.1% | <0.001 | [-5.9, -3.8] |
| latency-normalized wall s | 198.2 | 177.2 | -10.6% | 0.0012 | [-30.6, -11.1] |

## Behavior change: critical turns (crit > 0.5 s), per run

| agent | all runs: turns base / print | crit s base / print | matched: turns base / print | crit s base / print |
|---|---|---|---|---|
| run-unit | 8.80 / 6.53 | 35.1 / 26.0 | 8.56 / 6.50 | 33.5 / 26.2 |
| lead | 15.47 / 11.60 | 61.9 / 46.2 | 14.33 / 11.50 | 55.3 / 46.7 |
| build-task | 19.07 / 16.80 | 72.6 / 67.5 | 17.56 / 16.71 | 66.1 / 69.4 |
| review-branch | 7.67 / 6.00 | 46.8 / 35.5 | 5.67 / 6.07 | 32.3 / 34.9 |
| fix-review | 2.87 / 0.40 | 11.8 / 1.1 | 0 / 0 | 0 / 0 |
| total | 53.9 / 41.3 | 228.2 / 176.3 | 46.1 / 40.8 | 187.2 / 177.3 |

- run-unit (matched): the targeted turns went: read-wave-refs 1.00 to 0, worktree-setup 0.78 to 0, read-prompt+date 0.67 to 0, other 0.93 to 0.07, separate next-task 1.22 to 1.00: about 3.6 turns and 12.4 s removed, against the expected ~3.1 turns and 11.0 s. A new land-slot turn (0.11 to 1.43, +4.3 s) gives some back: net -2.06 turns, -7.3 s.
- lead (matched): verify-full+rules 1.22 to 0.36, read-findings 0.78 to 0.07, verify-reviews-only 1.00 to 0.64, memory/report write 0.33 to 0, other 0.89 to 0.57: net -2.83 turns, -8.6 s, against the expected ~2 turns and ~7 s.
- The two targeted agents together: -4.9 crit turns, -15.9 s per stage-matched run. build-task and review-branch moved +5.9 s the other way (no change targeted there), so matched crit total is -5.3 turns, -10.0 s.
- First review-branch prompt: print 1744 chars, 4.1 question lines; base 1347 chars, 4.9 question lines; both name review-rules. No sign of a thinner review brief.

## API luck and confounds

| metric | base mean (sd) | print mean (sd) | MW p | 95% CI |
|---|---|---|---|---|
| speed ratio (median latency / prediction, non-stall turns; higher = slower API) | 0.829 (0.109) | 0.898 (0.140) | 0.106 | [-0.019, +0.153] |
| critical stalls per run (residual > 8 s) | 0.53 | 0.40 | 0.77 | [-0.60, +0.33] |
| critical stall excess s per run | 6.2 | 4.7 | 0.59 | [-7.0, +4.1] |
| latency-normalized wall s (crit turns at predicted latency) | 237.2 (53.7) | 180.3 (17.7) | 0.0001 | [-85.5, -30.2] |
| fix-review per run | 0.40 | 0.07 | 0.080 | |
| build-task agents per run | 4.0 | 4.0 | 1.0 | |

- API luck did not favor print: its API ran slower (ratio 0.898 v 0.829; matched 0.921 v 0.823, p=0.06), stalls were alike. The wall gain holds after latency normalization.
- Start-time overlap: both arms started together; each run overlapped on average 6.5-6.7 same-arm and 7.7 other-arm runs. No build-task or wave difference (4 build-task agents in every run).
- Fix loops: 6 of 15 base runs v 1 of 15 print (Fisher exact two-sided p=0.080). Rounds 4-5 saw 18 in 75 (24%). This is the main confound: the review stage carries most of the headline gap (all-runs crit total -51.9 s, of which fix-review -10.6 s and review-branch -11.4 s). Whether print caused fewer fix loops (Option B changes how the review is dispatched) or chance did, these data cannot tell; hidden 17/17 in all 30 runs, so the extra base fix loops repaired nothing the hidden tests check.

## Cross-check of headline numbers

- Method 1, `record.json` per cell: wall mean 239.56 / 185.98 s, cost mean $0.6911 / $0.5830.
- Method 2, the sweep's results md (`/tmp/exo-ab6/<arm>/2026-10-19-sweep.md`, wall rounded to whole seconds): wall mean 239.40 / 186.07 s, median 217 / 184 s, cost total $10.367 / $8.745 (mean $0.6911 / $0.5830). Agree within rounding.
- Confidence: high in the numbers; high that print removes about 5 critical turns (~16 s) in run-unit and lead; medium on the size of the wall gain: the -53.6 s headline is inflated by the fix-loop imbalance, and the arm-attributable part is about 10-21 s (matched crit -10.0 s; matched latency-normalized -21.0 s, p=0.0012; matched raw wall -11.0 s, p=0.52).

## Cause of the spread

Read-only analysis of 75 flow-unit runs (rounds 3 to 5; 18 with a fix loop) split the within-class wall variance (variance left after demeaning wall by loop class) by component. Per-request model: sonnet `lat = 2.14 s + 5.05 s/ktok out + 0.09 s/ktok cache-write` (R2 0.12), opus `0.76 s + 9.4 s/ktok out` (R2 0.93).

- API latency, not turns, tokens, tools or concurrency, is about 84% of within-class wall variance (92% in non-loop runs). Fixed per-turn latency (49 critical turns at 2.1 s) is 6.5%, output tokens 8.6%, tool exec and gaps 0.6%, cache writes 0%.
- The latency part splits into stalled requests, about 25% (a turn more than 8 s over its prediction: 1.0% of requests, 0.6 per run on the critical path, mean 8.9 s, sd 17.2 s, sonnet only; 0 of 507 opus requests), and diffuse per-run speed, about 59% (a run's median latency over prediction has sd 0.137, correlation 0.74 with wall, drifts by round from 0.92 to 1.09). The split is threshold-dependent (stalls 25 to 38%).
- Confidence: high that API latency drives the spread; medium on the stall versus diffuse split.
- Consequence: the spread is not controllable from exo. The controllable levers are turns (2.1 s fixed plus about 0.15 s expected stall each) and output tokens, which move the mean. A 10 s effect is under the 38 s within-class sd, so round 6 also reports latency-normalized wall (critical turns at predicted latency), which strips about 84% of the noise.

## Result

Landing rule, applied literally:
- Wall lower with the CI or rank test supporting it: PASS. -53.6 s (-22.4%), median -15.5%, p=0.026, CI [-89.7, -19.1]; both support it.
- Cost not higher beyond noise: PASS. -15.6%, p=0.0023, CI [-0.171, -0.050].
- Hidden no worse: PASS. 255/255 in both arms, landed 60/60 in both.
- Verdict: lands under the rule. Caveat: most of the raw wall and cost gap follows the 6-v-1 fix-loop imbalance. Stage-matched raw wall alone does not pass (p=0.52); the mechanism (about 5 fewer crit turns) and latency-normalized matched wall (-21 s, p=0.0012) support a real but smaller gain, about 5-10%.

## Caveats

- n=15 per arm, one cell, one plan, one model. Stage-matched has only 9 base runs.
- Fix-loop count differs 6 v 1; whether the arm causes it is open.
- Latency normalization uses a per-model OLS fit (output, cache-create, cache-read tokens) on the pooled ab6 requests; it is a secondary metric.
- The classifier is regex on tool-call text (rules of `classify.mjs`); the print arm's new land-slot turn may be a renamed call of an old turn.
- Both arms ran at once with 10 concurrent cells.
- Raw data (untracked): `.worktrees/ab6-<arm>/benchmarks/runs/2026-10-19-ab6-<arm>`; derived `.exo/speed6/{raw6,crit6,turns6-base,turns6-print,ab6}.json`, `mech6.txt`, `latency6.txt`.
