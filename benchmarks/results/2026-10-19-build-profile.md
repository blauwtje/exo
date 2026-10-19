# Build profile: per-step wall time and review fix loops, 45 flow-unit runs

Profiles where the wall time of one `flow-unit` run goes and what the verify fix loop costs, from runs already saved by [round 3](2026-10-19-speed-round3.md) and its predecessor. No model call was made and nothing tracked was edited.

## Data

- 45 saved flow-unit runs: ab3 (n=5 x 3 arms: base, fanout, kind) and ab4 (n=15 x 2 arms: base, fanout). Wall mean 205.8 s, sd 53.2 s.
- Per-arm mean wall (s): ab3-base 198.5, ab3-fanout 175.2, ab3-kind 195.1, ab4-base 190.3, ab4-fanout 237.5.
- Fix-review ran in 10 of 45 runs (ab3: base 1, kind 2; ab4: base 2, fanout 5). Loop runs wall mean 270.1 s (sd 47.5), non-loop 187.5 s (sd 38.8).

## Method

- `record.json wallMs` is partitioned exactly into steps by painting each interval of the main transcript and `subagents/*.jsonl` timestamps with one label; subagent spans take priority over the lead. `startup_teardown` is `wallMs` minus the main-transcript span.
- `build_task` is the union of the 4 build-task spans (wall clock, tasks overlap). `ru_pre`, `ru_between`, `ru_land` are run-unit time before, between and after build-tasks. `lead_to_verify` is run-unit end to first review-branch dispatch.
- Variance share = cov(step, total wall) / var(total wall); shares sum to 100%.
- Fix-loop data from `record.json` `reviewStages`, transcripts, `benchmarks/pricing.mjs`, `benchmarks/build-phases.mjs`. Build-task guard of `max < 3` classified from each run's transcript writes. Pre-fix code run against `benchmarks/flow-hidden/truncate.test.js` with `node --test`.
- Scripts and dumps are untracked, in `.exo/speed-profile/`.

## Per-step wall (n=45)

| step | mean s | sd | share of wall % | share of wall variance % |
|---|---|---|---|---|
| startup_teardown | 1.6 | 1.2 | 0.8 | -0.2 |
| lead_setup | 17.5 | 4.3 | 8.5 | 3.7 |
| ru_pre | 10.4 | 6.6 | 5.1 | 2.6 |
| build_task | 65.2 | 19.9 | 31.7 | 21.2 |
| ru_between | 15.7 | 6.3 | 7.6 | 4.3 |
| ru_land | 7.1 | 5.6 | 3.5 | 3.5 |
| lead_to_verify | 24.6 | 19.2 | 11.9 | 15.2 |
| review_branch | 38.4 | 9.1 | 18.6 | 7.1 |
| lead_post_review | 9.2 | 3.2 | 4.5 | 2.0 |
| fix_review | 6.8 | 13.2 | 3.3 | 16.6 |
| lead_post_fix | 1.4 | 2.7 | 0.7 | 3.5 |
| re_review | 5.0 | 10.6 | 2.4 | 12.9 |
| lead_post_rereview | 2.9 | 6.4 | 1.4 | 7.8 |

Rollups (overlap the steps): run-unit window 98.5 s (47.8%, variance share 31.6%); lead think/idle gaps 55.6 s (27.0%, 32.1%); review-branch + re-review 43.4 s (21.1%, 20.0%); verify phase 88.2 s (42.9%, 65.0%).

## Largest and most variable step

- Largest: `build_task`, 65.2 s, 31.7% of wall. Next: `review_branch` 38.4 s (18.6%), `lead_to_verify` 24.6 s (11.9%), `lead_setup` 17.5 s (8.5%).
- Most variable: `build_task` by sd (19.9 s) and by variance share (21.2%). `lead_to_verify` is close (sd 19.2 s, 15.2%) but driven by one outlier, ab4-fanout-15: a 122 s single lead thinking turn, 143.6 s in total; no other run exceeds 48 s.
- The whole fix loop (`fix_review`, `re_review`, `lead_post_fix`, `lead_post_rereview`) explains about 41% of wall variance and ran in 10 of 45 runs.
- Tool execution is small: non-Agent tool exec is 1.6% of lead span, 4.2% of build-task, 1.4% of review-branch, 17.5% of run-unit. Time is model latency, not command run time.
- The 4 build-task spans sum to 106 s per run but overlap to 65 s wall; the longest single task averages 33.8 s.

## Fix-loop findings

- Trigger: all 10 loops come from `src/truncate.js` when `max < 3`. The plan's Data line says "the result is exactly max characters long"; `text.slice(0, max - 3)` slices from the tail for `max < 3`, so `truncate('hello world', 2)` returns `'hello worl...'`.
- Real vs graded: real against the plan's literal text (10/10 runs), 0/10 by the graded spec. Hidden tests use `max` = 3, 5, 9, 12 only; the pre-fix code passes 5 of 5 (measured), as does the post-fix code. No fix was needed for the hidden tests; `hiddenPass` is true in 45/45.
- Builder: plain `slice(0, max - 3)` in 40 of 45 builds, a `Math.max(0, max - 3)` clamp in 5. No run guarded `max < 3` up front. Non-loop runs guarded 4 of 35 (11%); builder clamp rate base 4/20, fanout 1/20, kind 0/5.
- Reviewer catch rate on the 40 unguarded builds: raised in 12 (30%), routed `fix` in 8 (20%), missed in 28 (70%). Clamped builds: flagged 1 of 5. The loop is reviewer routing of an identical defect, not builder variance.
- ab4-fanout-7 is a loop by fix-review dispatch only: fix count 0, no code edit, no re-review. Loops that edited code: 9. Fixers were `exo:fix-review` (sonnet/high); every re-review returned CLEAN.
- Arm: ab4 fanout 5/15 against base 2/15, Fisher exact two-sided p=0.39; ab3 all p >= 0.44. No arm difference holds beyond chance.
- Added wall: mean 67.9 s, first review end to second review end (lower bound; fanout-7 ends at fix-review end), fix-review 30.5 s, re-review 25.0 s; with lead gaps (about 20 s per full loop) a full loop is about 75 s.
- Added cost: loop runs $0.841 (sd 0.083) against non-loop $0.611 (sd 0.026), +$0.23. Fix-review plus re-review subagents cost $0.130 on average (excluding the lead).
- Added tokens per loop run: +80.7k weighted; the lead's verify and landing turns are about 44k (54%), the fix-review and re-review subagents about 37k.
- Fix edits: nine code fixes each add a `max < 3` branch in `src/truncate.js`; 8 add a test for `max` 0 to 2. No existing assertion was removed or changed.
- Loop vs non-loop class explains 44% of total wall variance; the other 56% is within-class noise.

## Cross-checks and confidence

- All 45 per-run wall values match the results docs within 0.049 s; tokens match exactly; run-unit wall within 0.5 s; per-arm mean walls match. Step sums equal `wallMs` by construction (max diff 0).
- Main-transcript span against `wallMs` differs by 1.6 s on average (max 3.9 s); `wallMs` is trusted for totals.
- Confidence: high on totals, medium-high on step boundaries (an edge can move by one lead turn, 1-3 s).
- Fix-loop real-vs-graded verdict: high for "hidden tests pass without the fix", medium for calling the finding a real defect (a reader could call the broken contract real; the reviewer in fanout-7 asked it as a plan-intent question).
- Serial independent read-only calls (heuristic, upper bound): about 3 s per run at most, under 2% of wall.

## What this means for the next speed idea

- The biggest single step is `build_task` (31.7% of wall, 21.2% of variance); the biggest avoidable block is the fix loop, about 75 s and +$0.23 per loop run for no graded benefit, 10 of 45 runs.
- Candidate fixes for the loop, untested: (a) the fixture plan states the `max < 3` behavior or limits it to `max >= 3`; (b) `review-branch.md` routes a literal-contract break on input the plan leaves undefined to `question`; (c) the build-task prompt asks for a test at each boundary a Data line implies. (a) removes both the defect and the reviewer lottery.
- A parallel-tool-call line has little to win: serial chains cost under 2% of wall.
- Fan-out differences between arms are mostly the number of loops, not fan-out code: fanout's 5 of 15 loops against base's 2 of 15 is not significant (p=0.39).

## Caveats

- One cell, one plan, one model; the fix-loop trigger is specific to this fixture's `truncate` Data line.
- Temp repos and `diff.patch` are gone, so code state comes only from transcript writes and edits.
- Raw data and scripts (untracked, kept): `.exo/speed-profile/`, `.worktrees/ab{3,4}-<arm>/benchmarks/runs/`.
