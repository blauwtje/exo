# adhd style pair, 2026-11-12

## Case repair

Commit 69eef9737. `choice-plan-split` no longer sets `ask`: its context names the deciding rule, so the style wants "**No**, ...". `report-nine-changes` keeps `**Also:**` and now asks 2 full facts (retry 5 -> 3, timeout 30 s -> 60 s) plus 7 facts of the form "the <x> change (<y>) is named".

Tests in `tests/adhd-cases.test.mjs`: 'choice-plan-split accepts the observed No reply', 'report-nine-changes asks at most 4 full facts and names the rest', and the count test now expects 3 ask cases.

Seen in the paid run: both base answers of `choice-plan-split` now pass every gate ("**No**, task 3 breaks the project rule; split the rename into its own task."), where the baseline failed `question`. `report-nine-changes` still keeps no answer in full: the judge failed Also-list name facts in all 4 answers (facts missing per answer: 1, 1, 1 and 6). The four Also lines:

- candidate 1: `**Also:** CI lint, cache key, docs index, build flag, release note, sweep` (missing 9)
- candidate 2: `**Also:** lint rule, cache key, docs index, build script, release note, sweep` (missing 1)
- base 1: `**Also:** CI lint, cache key, docs index, dead flag, release note, repo sweep` (missing 1)
- base 2: `**Also:** CI lint, cache key, archived repos, docs index, dead flag, release note` (missing 1,2,5,7,8,9)

The repaired facts fit the style, but the judge does not yet pass bare Also names reliably.

## Paired tool

Commit ed89b1476 adds `--base-style <file>`: one run, both arms, one cap, each arm's first answer alone, and paired candidate-minus-base `pairedDiff` lines.

Review reported two concerns and fixed neither: a base file without `name: adhd` frontmatter would run unstyled, and the error-path record lacks `baseStyle`.

## Pre-registration

Written before any paid call.

Change: one bullet under `## Outranks brevity` in `output-styles/adhd.md`:
`- Every figure and count the source gives for the answer stays in, past any word or bullet cap.`
Target: strict facts_kept (weakest figure, 58.3%).

Cases: the six quick cases whose baseline answers lost facts, both repaired cases included, cheapest first so the first-answer projection is low: choice-model-choice, choice-release-now, choice-plan-split, explain-why-three-runs, analyse-video-transcript, report-nine-changes.

Design: one run, `--base-style <old adhd.md>` vs candidate, `--answers 2`, `--model claude-fable-5-2`, 6 cases x 2 answers x 2 arms = 24 answers.

Measure: per case candidate minus base of strict facts-kept share, `pairedDiff` over 6 cases (z 1.96). Secondary: visible ratio, same pairing.

Expected per-case facts-kept difference: explain-why-three-runs +0.5..+1 (0.04/0.05 and $2.41 literals); choice-release-now +0.5..+1 ("three entries"); choice-plan-split 0..+0.5 ("one more task"); analyse-video-transcript 0..+0.5 ("five of the six"); choice-model-choice 0; report-nine-changes 0.

Expected mean about +0.33, interval lower bound above 0 when at least two cases flip fully. Visible ratio expected to rise about +0.05..+0.15.

Sizing: with the ablation sd 0.118 the 95% half-width at 6 cases is 1.96 x 0.118 / sqrt(6) = 0.094, below the expected +0.33; a binary facts share spreads wider than 0.118, so the real half-width is larger.

Decision rule: interval wholly above 0 keeps the line; otherwise report it and do not land the line. No second paid round.

## Cost

Estimate (from the baseline fable run: a call costs about 0.027 + 0.000048 x billed tokens, first call per style adds about 0.041 cache write): about 1.40, +30% output tokens about 1.59. The default cap with the flag is 0.96, below the estimate, so the run passed `--max-usd 2.09`.

Actual: cost_usd 1.2153 (reply 1.2052, judge 0.0101).

Ledger: 2.9088 before, 4.1241 of 5 after, 0.8759 unspent.

## Run

Command:

```
node benchmarks/adhd-score.mjs --base-style .exo/adhd-honest/base-adhd.md --cases choice-model-choice,choice-release-now,choice-plan-split,explain-why-three-runs,analyse-video-transcript,report-nine-changes --answers 2 --model claude-fable-5-2 --max-usd 2.09 --log-dir .exo/adhd-honest/records
```

Output (stdout then stderr, verbatim):

```
median_ratio=0.562 answer_first=83.3% clean_deliverable=n/a question_last=100.0% facts_kept=25.0% facts_share=76.0%
mean_ratio 0.538 se 0.111 ci95 0.320..0.757 (n=6) vs_baseline=shorter
power: 6 tasks x 2 samples x 2 arms = 24 runs; an effect of 0.1 needs 12 tasks (alpha 0.05, power 0.8); MDE (lower bound) at 6 tasks is 0.139; answers_per_case_needed=4
billed_median=1.756
AGENT-LABELS adhd-facts n 12 labels made by an agent, not by the user
choice-model-choice ratio=0.440 visible=52/117 billed=253/325 failed=none missing=3
choice-release-now ratio=0.797 visible=55/69 billed=588/185 failed=none missing=none
choice-plan-split ratio=0.465 visible=34/72 billed=380.5/150 failed=literals missing=1,3
explain-why-three-runs ratio=0.660 visible=79/119 billed=369/376 failed=none missing=1
analyse-video-transcript ratio=0.078 visible=26/334 billed=708/768 failed=lead missing=1
report-nine-changes ratio=0.790 visible=89/113 billed=568/180 failed=none missing=1,9
base median_ratio=0.345 answer_first=83.3% clean_deliverable=n/a question_last=100.0% facts_kept=25.0% facts_share=60.0%
base choice-model-choice ratio=0.397 visible=47/117 billed=253.5/325 failed=none missing=3
base choice-release-now ratio=0.638 visible=44/69 billed=490.5/185 failed=none missing=1
base choice-plan-split ratio=0.292 visible=21/72 billed=358/150 failed=none missing=3
base explain-why-three-runs ratio=0.206 visible=25/119 billed=291.5/376 failed=literals missing=none
base analyse-video-transcript ratio=0.281 visible=94/334 billed=834.5/768 failed=lead missing=none
base report-nine-changes ratio=0.799 visible=90/113 billed=794.5/180 failed=none missing=1,2,5,7,8,9
paired facts_kept candidate-base mean=0.000 ci95 -0.438..0.438 n=6
paired ratio candidate-base mean=0.103 ci95 -0.073..0.279 n=6
cost_usd=1.2153 reply_cost_usd=1.2052 judge_cost_usd=0.0101 call_timeouts=0 parse_retries=0 dropped_votes=0
```

## Per case

Strict kept per answer: no `literals` failure and no missing fact, read from `.exo/adhd-honest/answers.md`. Kept is x of 2 answers.

| Case | Arm | Kept | Visible ratio | Failed | Missing |
| --- | --- | --- | --- | --- | --- |
| choice-model-choice | base | 0 of 2 | 0.397 | none | 3 |
| choice-model-choice | candidate | 0 of 2 | 0.440 | none | 3 |
| choice-release-now | base | 1 of 2 | 0.638 | none | 1 |
| choice-release-now | candidate | 2 of 2 | 0.797 | none | none |
| choice-plan-split | base | 0 of 2 | 0.292 | none | 3 |
| choice-plan-split | candidate | 0 of 2 | 0.465 | literals | 1,3 |
| explain-why-three-runs | base | 0 of 2 | 0.206 | literals | none |
| explain-why-three-runs | candidate | 1 of 2 | 0.660 | none | 1 |
| analyse-video-transcript | base | 2 of 2 | 0.281 | lead | none |
| analyse-video-transcript | candidate | 0 of 2 | 0.078 | lead | 1 |
| report-nine-changes | base | 0 of 2 | 0.799 | none | 1,2,5,7,8,9 |
| report-nine-changes | candidate | 0 of 2 | 0.790 | none | 1,9 |

Candidate minus base of the kept share, against the pre-registered expectation:

| Case | Difference | Expected | Ratio difference |
| --- | --- | --- | --- |
| choice-model-choice | 0.0 | 0 | +0.043 |
| choice-release-now | +0.5 | +0.5..+1 | +0.159 |
| choice-plan-split | 0.0 | 0..+0.5 | +0.173 |
| explain-why-three-runs | +0.5 | +0.5..+1 | +0.454 |
| analyse-video-transcript | -1.0 | 0..+0.5 | -0.203 |
| report-nine-changes | 0.0 | 0 | -0.009 |

- explain-why-three-runs: base fails `literals` in both answers. The candidate keeps 0.04 to 0.05, 0.03, 0.024 and $2.41 in both; one answer was still judged missing fact 1. Within expectation.
- choice-release-now: both arms say "three lines"; base answer 2 was judged missing fact 1. Within expectation.
- choice-plan-split: candidate answer 2 gave two options and a question without "rename". Within expectation (no change).
- analyse-video-transcript: the candidate answered "**Yes**, only habit six is new ..." in one sentence in both answers and lost fact 1; base kept both. Outside expectation; the cause is unknown.
- choice-model-choice: no change, fact 3 missing in both arms.
- report-nine-changes: no change in kept answers.

## Result

The baseline (12 cases) and the paired run (6 cases) use different case sets, so only the paired columns compare.

| Figure | Before (baseline, 12 cases x 2 answers) | Paired base (6 cases x 2 answers) | Paired candidate | Interval |
| --- | --- | --- | --- | --- |
| median visible ratio | 0.457 | 0.345 | 0.562 | paired +0.103, ci95 -0.073..+0.279, n=6 |
| facts_kept | 58.3% (14 of 24) | 25.0% | 25.0% | paired mean 0.000, ci95 -0.438..0.438, n=6 |
| facts_share | 60.8% | 60.0% | 76.0% | none printed |
| question_last | 87.5% | 100.0% | 100.0% | none printed |
| answer_first | 91.7% | 83.3% | 83.3% | none printed |

## Decision

The facts_kept interval holds zero, so the decision rule keeps the old style: the line (branch commit eaa689686) is not landed and `output-styles/adhd.md` is unchanged on main. No second paid round.

facts_share rose 60.0% -> 76.0% and the ratio rose +0.103, but no interval excludes zero: none is printed for facts_share, and the ratio interval is -0.073..+0.279.
