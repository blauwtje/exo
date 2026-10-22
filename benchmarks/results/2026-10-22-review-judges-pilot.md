# Review judges pilot (experiment B)

Date 2026-10-22. Arms ran from a detached worktree at main `26644379`, opus at `high`, concurrency 5 per arm, 10 cells, 3 repeats (30 control sessions, 90 treatment sessions). Both arms graded through `benchmarks/merge-judges.mjs`. Logs: `.exo/harness/logs/p3b-{control,treat}-{r1,r23}.log`; run records: `.exo/harness/runs/p3b-{control,treat}-{r1,r23}/merged-judges.json`.

Treatment = three isolated judges (`--reviewer-bodies plan-fit,standard,tests`), control = one `review-branch` pass.

## Stop rule

Round 1: the treatment missed no `safe/*` seed the control hit (the control missed safe-path, the treatment hit it) and added 0 false alarms over the control. No cell had a nonzero exit, a timeout or a missing report. Repeats 2-3 ran.

## Results (3 repeats per case)

| Measure | Control | Treatment |
|---|---|---|
| `safe/*` seeds hit (of 15) | 14 | 15 |
| `reportHits` (of 15) | 14 | 15 |
| Green-first defect found (of 3) | 3 | 3 |
| False alarms on 4 valid controls (12 cells) | 1 | 3 |
| Tokens, all sessions | 1,168,767 | 3,264,369 |
| Cost, all sessions | $5.006 | $13.767 |
| Wall per case, max over judges, mean | 29.2 s | 29.3 s |
| Wall per case, sum over judges, mean | 29.2 s | 71.9 s |
| Slowest case wall (max) | 56.5 s | 53.5 s |

Treatment/control: tokens 2.79x, cost 2.75x. Total pilot spend $18.77 of the $20 cap.

Per case (mean of 3, tokens / USD, control then treatment): auth-token control 36,139 / 0.152 vs 100,010 / 0.420; auth-token seeded 37,016 / 0.161 vs 107,455 / 0.448; csv-sum seeded 45,277 / 0.195 vs 129,748 / 0.562; green-first 40,889 / 0.173 vs 109,607 / 0.470; rate-limit control 34,932 / 0.156 vs 115,098 / 0.498; rate-limit seeded 36,157 / 0.153 vs 102,882 / 0.427; safe-path control 46,506 / 0.205 vs 103,860 / 0.450; safe-path seeded 40,243 / 0.171 vs 117,723 / 0.486; sql-user control 33,732 / 0.142 vs 96,341 / 0.400; sql-user seeded 38,699 / 0.159 vs 105,397 / 0.427.

## Reading

- The pilot sits at a ceiling (the single reviewer hit 15 of 15 before), so it can show only harm or cost, not gain. The one control miss (safe-path seeded, round 1) is a single sample; one miss does not show a recall gain.
- Harm: the treatment's 3 control false alarms sit all on `db.js:10-12` of sql-user, the same lines the control flagged once. In one treatment cell two judges flagged those lines and the merge kept both, so that cell counts 2; by distinct location the treatment has 2 cells with a false alarm against 1.
- Cost: the treatment costs about 2.75x tokens and dollars for no measured catch gain here; wall is equal when the judges run in parallel and 2.5x when run one after another.
- Not tested: the std-* and weak-* seeds, where isolated judges could gain. They do not exist yet.
- Full-run stop rule: keep only if the treatment catches at least 2 more std/weakened seeds over 3 rounds with no rise in false alarms; drop if tokens are above 2x with no added catch. The 2.79x token ratio already exceeds that bar, so the full run must show the catch gain.
