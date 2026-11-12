# adhd style measure, 2026-11-12

## Labels

Who labelled: the scorer's shared store (git common dir `exo/adhd/labels.jsonl`) held 58 labels with no `labeler` field before this task; who made them is unknown, so they are not counted as user-made. This task appended 12 facts labels with `labeler` `agent`: all labels here are agent-made, none user-made. Each was written from the reply and the case's fact list before any judge vote was seen. The 12 replies are the `claude-opus-5-5` quick-run answers of `2026-11-12T14-49-45-178Z.json` (5 PASS, 7 FAIL); a strict reading counts a fact only when the reply states it.

Calibrate (`--calibrate --max-usd 0.25`, 3 votes, all 37 facts rows of the store, 12 agent-made and 25 of unknown origin):

`facts 36/37 pass_rows=10/10 fail_rows=26/27 built_fail_rows=20/20 deleted_fact_only=19/20`

Computed from those counts: kappa 0.93, 95% interval 0.81..1.00 (observed 0.973, expected 0.593), n 37. The scorer's gate (`calibrationKappaFloor` 0.6 on the lower bound, 30 labels minimum) is met, so no judge repair task. Caveat: the 37 rows are agent-made or of unknown origin, so the figure shows agreement with an agent, not with the user.

Disagreeing items: one FAIL-labelled row was judged PASS (`--calibrate` prints no row ids, so the item is not named). `choice-model-choice`: my label is PASS (the reply ends on "How much does one missed bug cost you compared with the price difference?", which is the user's call); the judge, in this calibrate run, also voted PASS on it (pass_rows 10/10). The earlier quick run marked that fact missing, so the judge flipped between runs on this case.

Stability (`--stability`, 8 gate-passing replies, 5 repeats, 3 votes):

`facts flipped=1/8 flip_rate=0.125 minority_share=0.050 fact_flipped=1/25 fact_flip_rate=0.040`

Cost: calibrate $0.0190, stability $0.0087, total $0.0277 of the $0.40 cap (ledger `.exo/adhd-proof/progress.md`).

## Pilot

Commands as typed:

- `node benchmarks/adhd-score.mjs --concise-baseline --model claude-fable-5-2 --max-usd 0.90` resumed the 3 stored cases and built the rest of the quick list (12 cases): cost_usd 0.6382.
- `node benchmarks/adhd-score.mjs --answers 2 --model claude-fable-5-2 --max-usd 1.25 --log .exo/logs/task7-before.json` was refused (projected_usd 1.6653 over the cap) after one answer for $0.0694.
- `node benchmarks/adhd-score.mjs --answers 2 --model claude-fable-5-2 --max-usd 1.70 --log .exo/logs/task7-before-2.json` ran once: cost_usd 1.1461 (reply 1.1355, judge 0.0106), 12 cases x 2 answers.

Cost per answer: 1.1461 / 24 = $0.0478 (estimate 0.045). The after run with the identical command costs about the same, 1.15, with the 1.70 cap held back.

The power line is paired and assumes no case-by-style interaction. Log: `.exo/logs/task7-before-2.log` (stdout `.exo/logs/task7-before-2.out`).

Ledger: spent 2.2848 of 5; 2.7152 left; holding back 1.70 for the after run, the ablation may use at most 1.0152 (about one arm at 0.55, estimated).

Run output (stdout then stderr, verbatim):

```
median_ratio=0.457 answer_first=91.7% clean_deliverable=100.0% question_last=87.5% facts_kept=58.3% facts_share=60.8%
mean_ratio 0.507 se 0.073 ci95 0.365..0.650 (n=12) vs_baseline=shorter
power: 12 tasks x 2 samples x 2 arms = 48 runs; an effect of 0.1 needs 5 tasks (alpha 0.05, power 0.8); MDE at 12 tasks is 0.062; answers_per_case_needed=1
billed_median=0.960
AGENT-LABELS adhd-facts n 12 labels made by an agent, not by the user
failure-q1 ratio=0.142 visible=39/270 billed=267/852 failed=none missing=none
ralph-vs-subagents ratio=0.438 visible=107/243 billed=751/748 failed=none missing=none
choice-worktree-cleanup ratio=0.470 visible=90/192 billed=644/361 failed=none missing=none
choice-model-choice ratio=0.444 visible=52/117 billed=259.5/325 failed=none missing=3
choice-release-now ratio=0.681 visible=47/69 billed=551.5/185 failed=none missing=1
choice-plan-split ratio=0.424 visible=31/72 billed=600/150 failed=literals,question missing=3
deliverable-commit-gate ratio=0.700 visible=14/20 billed=22/26 failed=none missing=none
deliverable-commit-fix ratio=0.714 visible=15/21 billed=26/30 failed=none missing=none
deliverable-pr-title ratio=0.886 visible=20/22 billed=27.5/30 failed=none missing=none
explain-why-three-runs ratio=0.223 visible=27/119 billed=330.5/376 failed=literals missing=none
analyse-video-transcript ratio=0.160 visible=54/334 billed=793/768 failed=lead missing=1,2
report-nine-changes ratio=0.808 visible=91/113 billed=746.5/180 failed=none missing=1,2,5,7,8,9
cost_usd=1.1461 reply_cost_usd=1.1355 judge_cost_usd=0.0106 call_timeouts=0 parse_retries=0 dropped_votes=0
```

## Before

Command: `node benchmarks/adhd-score.mjs --answers 2 --model claude-fable-5-2 --max-usd 1.70 --log .exo/logs/task7-before-2.json` (12 cases x 2 answers, cost_usd 1.1461). The scorer stored its record at `.exo/adhd-score/2026-11-12T15-55-21-736Z.json`, not at the `--log` path; it keeps the first answer's text per case, so the second answer of each case was not readable and the table below reads the stored one.

| Measure | Figure | Goal | Met |
| --- | --- | --- | --- |
| median_ratio (visible) | 0.457 | at most 0.45 | missed |
| mean_ratio | 0.507, ci95 0.365..0.650, n=12 | none | |
| billed_median | 0.960 | no rise | reference |
| facts_kept strict | 58.3% (14 of 24 answers) | at least 60% (15 of 24) | missed |
| facts_share | 60.8% | printed beside | |
| question_last | 87.5% | at least 75% | met |
| answer_first / clean_deliverable | 91.7% / 100.0% | none | |

Each case: ratio, the two answer ratios (kept for the paired read), billed and visible tokens (mean of 2 answers), hidden = billed minus visible.

| Case | ratio | answers | billed | visible | hidden |
| --- | --- | --- | --- | --- | --- |
| failure-q1 | 0.142 | 0.141 / 0.144 | 267 | 38.5 | 228.5 |
| ralph-vs-subagents | 0.438 | 0.481 / 0.395 | 751 | 106.5 | 644.5 |
| choice-worktree-cleanup | 0.470 | 0.459 / 0.480 | 644 | 90 | 554 |
| choice-model-choice | 0.444 | 0.393 / 0.496 | 259.5 | 52 | 207.5 |
| choice-release-now | 0.681 | 0.594 / 0.768 | 551.5 | 47 | 504.5 |
| choice-plan-split | 0.424 | 0.292 / 0.556 | 600 | 30.5 | 569.5 |
| deliverable-commit-gate | 0.700 | 0.700 / 0.700 | 22 | 14 | 8 |
| deliverable-commit-fix | 0.714 | 0.714 / 0.714 | 26 | 15 | 11 |
| deliverable-pr-title | 0.886 | 0.864 / 0.909 | 27.5 | 19.5 | 8 |
| explain-why-three-runs | 0.223 | 0.210 / 0.235 | 330.5 | 26.5 | 304 |
| analyse-video-transcript | 0.160 | 0.227 / 0.093 | 793 | 53.5 | 739.5 |
| report-nine-changes | 0.808 | 0.808 / 0.808 | 746.5 | 91 | 655.5 |

Most hidden thinking: analyse-video-transcript 739.5, report-nine-changes 655.5, ralph-vs-subagents 644.5, choice-plan-split 569.5, choice-worktree-cleanup 554. The four deliverable cases hide at most 11. Highest visible ratios: deliverable-pr-title 0.886, report-nine-changes 0.808, deliverable-commit-fix 0.714, deliverable-commit-gate 0.700, choice-release-now 0.681. The three deliverables are one bare line, so the style cannot shorten them; no rule explains their ratio.

Strict facts_kept counts an answer as kept only when it passes the literals gate and has no missing fact. 24 - 14 = 10 failing answers, and they lie among the 12 answers of the six cases below (choice-model-choice, choice-release-now, choice-plan-split, explain-why-three-runs, analyse-video-transcript, report-nine-changes), each of which carries a failed gate or a missing fact in the record; the other six cases carry none, so their 12 answers are kept and 2 of the 12 answers on these six cases are kept. The record keeps `failed` and `missing` as a union over both answers, so it does not store which answers.

| Case | Failure | Reply text | Rule followed |
| --- | --- | --- | --- |
| choice-plan-split | missing 3 (splitting costs one more task); failed question | "**No**, task 3 breaks the project rule; split the rename into its own task." | `one-sentence` ("One point -> one sentence of at most 15 words, then stop") and "answer a yes/no question with Yes, No or Maybe" beat "end on the question"; the cost fact has no room in one sentence. `failed=literals` is not shown: this reply holds "rename", so it came from the second answer, unread |
| choice-model-choice | missing 3 (the tradeoff is the user's call) | two bullets, then "How much does a missed bug cost you?" | the 8-word bullet limit; the question carries the call but never says it is the user's. The judge flipped on this fact before (Labels) |
| choice-release-now | missing 1 (three entries wait) | "**Now:** `release.yml` cuts a patch release today." | unclear: no rule drops the count; the 8-word bullet limit leaves no room for it |
| analyse-video-transcript | failed lead ("mostly no"); missing 1, 2 | "- **Useful:** **1 of 6** habits is new." first, no verdict | bullet format of "Answer first" with at most 8 words and a label; `lead` wants the verdict phrase. Missing 1 and 2 are not shown: the reply holds the new idea and the advice, so unclear |
| report-nine-changes | missing 1, 2, 5, 7, 8, 9 | 4 change bullets (one is "Status") plus "**Also:** CI lint, cache key, docs index, build flag, release note, archived repos" | "at most 5 bullets" with "**Also:**" naming leftovers in 1 to 2 words: six facts become bare nouns the judge rejects; "Status" spends a slot |
| explain-why-three-runs | failed literals (no 0.04/0.05, no $2.41) | "Only 3 runs cut score noise to **0.024**; the improve loop needs 0.03 or less." | `one-sentence` and `no-why` ("Give the what, not the why"): the question is why, and the cost and the old noise are dropped |

Named rule: `one-sentence` ("- One point → one sentence of at most 15 words, then stop."). It explains choice-plan-split (2 failing answers) and, with `no-why`, explain-why-three-runs (a literals failure, which counts against facts_kept): two of the six failing cases, among the 10 failing answers; the record does not store how many answers per case. Shortening it to the first half, "One point → one sentence.", lifts the cap that dropped the cost fact and the old-noise figures, and the replies stay at 26 to 31 visible tokens, so a longer sentence adds few tokens against the 0.45 ratio. Goal 60% needs one more answer, so fixing choice-plan-split alone would reach 16 of 24.

Runner-up: the 8-word bullet limit in `- Put at most 5 bullets in a reply ... of at most 8 words, label included` (choice-model-choice, choice-release-now, analyse-video-transcript, report-nine-changes; it explains 8 failing answers but a longer bullet raises the ratio on cases already near 0.45).

median_ratio=0.457 facts_kept=58.3% facts_share=60.8% question_last=87.5% billed_median=0.960

## Ablation

Rule named by Task 8: `one-sentence`, one of the nine `BREVITY_LINES` that the request fixes verbatim, so Task 10 may not edit it without the user's word. One arm, run once; no second arm.

Command: `node benchmarks/adhd-score.mjs --ablate one-sentence --cases choice-plan-split,choice-model-choice,choice-release-now,analyse-video-transcript,report-nine-changes,explain-why-three-runs --answers 2 --model claude-fable-5-2 --max-usd 1.00` (cost_usd 0.6240, record `.exo/adhd-score/2026-11-12T16-22-15-518Z.json`). Stderr summary:

```
mean_ratio 0.514 se 0.082 ci95 0.353..0.675 (n=6) vs_baseline=shorter
power: 6 tasks x 2 samples x 2 arms = 24 runs; an effect of 0.1 needs 6 tasks (alpha 0.05, power 0.8); MDE at 6 tasks is 0.097; answers_per_case_needed=2
billed_median=1.895
AGENT-LABELS adhd-facts n 12 labels made by an agent, not by the user
choice-model-choice ratio=0.440 visible=52/117 billed=247/325 failed=none missing=3
choice-release-now ratio=0.638 visible=44/69 billed=457.5/185 failed=none missing=1
choice-plan-split ratio=0.590 visible=43/72 billed=552.5/150 failed=literals,question missing=none
explain-why-three-runs ratio=0.462 visible=55/119 billed=495/376 failed=literals missing=none
analyse-video-transcript ratio=0.185 visible=62/334 billed=654.5/768 failed=lead missing=1
report-nine-changes ratio=0.768 visible=87/113 billed=637.5/180 failed=none missing=1,2,4,5,7,8,9
median_ratio=0.526 answer_first=83.3% clean_deliverable=n/a question_last=83.3% facts_kept=33.3% facts_share=54.0%
cost_usd=0.6240 reply_cost_usd=0.6191 judge_cost_usd=0.0050 call_timeouts=0 parse_retries=0 dropped_votes=0
```

Per case, before / ablated (visible ratio and billed tokens are the mean of 2 answers; `missing=` is printed 1-based, as in the run):

| Case | visible ratio | billed | failed | missing |
| --- | --- | --- | --- | --- |
| choice-model-choice | 0.444 / 0.440 | 259.5 / 247 | none / none | 3 / 3 |
| choice-release-now | 0.681 / 0.638 | 551.5 / 457.5 | none / none | 1 / 1 |
| choice-plan-split | 0.424 / 0.590 | 600 / 552.5 | literals,question / literals,question | 3 / none |
| explain-why-three-runs | 0.223 / 0.462 | 330.5 / 495 | literals / literals | none / none |
| analyse-video-transcript | 0.160 / 0.185 | 793 / 654.5 | lead / lead | 1,2 / 1 |
| report-nine-changes | 0.808 / 0.768 | 746.5 / 637.5 | none / none | 1,2,5,7,8,9 / 1,2,4,5,7,8,9 |

Paired per-case difference, ablated minus before, mean with 95% interval over the six cases (`pairedDiff`):

| Measure | mean | ci95 |
| --- | --- | --- |
| visible ratio | +0.057 | -0.037..+0.152 |
| billed tokens | -39.5 | -127.2..+48.2 |

Facts: the record keeps `failed` and `missing` per case, not per answer. Strict facts_kept on the six cases (an answer passes the literals gate and has zero missing facts): before 2 of 12 answers (derived: the other six before cases are all kept, 14 - 12 = 2), ablated 4 of 12 (printed facts_kept=33.3%). The record does not store which answers. The share of facts kept in the ablated run is 54.0%; the six before cases are not printed as a share.

Replies, ablated, first answer:

choice-plan-split:
> - **Split:** follows rule; adds task, about one run.
> - **Keep joined:** breaks the rule; smaller.
>
> Split task 3, or keep it joined?

explain-why-three-runs:
> - **Noise:** 0.04 to 0.05 -> **0.024** (3 runs).
> - **Needed:** improve loop needs **0.03** or less.
> - **Cost:** about **$2.41** for 34 cases.

Readout: removing `one-sentence` took strict facts_kept on the six cases from 2 to 4 of 12 answers (choice-plan-split now holds its cost fact in the first answer read) and let explain-why-three-runs name the old noise, the cost and the target, but both still fail the literals gate and choice-plan-split still fails `question` in the stored record. It cost +0.057 visible ratio (ci -0.037..+0.152, which includes zero, so not greater than noise) and billed tokens were not higher (mean -39.5, ci -127.2..+48.2). The gain is real in the replies read but not shown by the interval at 6 cases (MDE 0.097). The visible ratio rose, so the 0.45 goal moves further away; `one-sentence` is a `BREVITY_LINES` slug, so Task 10 may not edit it without the user's word.

## After

no edit, no after run. Task 10 made no edit to `output-styles/adhd.md`, so the identical command would measure the same style again and no paired difference exists. No paid command ran in this task.

Why no edit, in figures from `## Before` and `## Ablation`:

1. Before, claude-fable-5-2, 12 cases x 2 answers: median visible ratio 0.457 (goal at most 0.45), facts_kept 58.3% (goal at least 60%), question_last 87.5% (goal at least 75%), billed_median 0.960, mean ratio 0.507 with ci95 0.365..0.650, MDE 0.062.
2. Both misses are smaller than the noise. The median misses by 0.007 against an MDE of 0.062. Facts miss by one answer of 24 (14 kept, 15 needed) against a judge flip_rate of 0.125, so a rerun with no edit could cross either line. An edit would have to cut the mean ratio by more than 0.062 for its interval to exclude zero.
3. Length and facts pull apart per case. Sorted by visible ratio, the six shortest cases are failure-q1 0.142, analyse-video-transcript 0.160, explain-why-three-runs 0.223, choice-plan-split 0.424, ralph-vs-subagents 0.438, choice-model-choice 0.444; four of the six carry a failed gate or a missing fact. The three deliverable cases sit at 0.700 to 0.886 as one bare line. Removing `one-sentence` gave back facts on choice-plan-split and explain-why-three-runs at +0.057 visible ratio (ci -0.037..+0.152), with strict facts at 4 of 12 answers on the six cases (before 2 of 12).
4. report-nine-changes cannot pass strict facts under the style: its literals require `**Also:**` while the judge wants all nine facts stated, and the style allows 5 bullets.
5. `one-sentence` is one of the nine `BREVITY_LINES` the request fixes verbatim, so the one rule the replies pointed at was not open to edit.

Check on the MDE: the printed MDE 0.062 comes from a power line that pairs each case with itself, with no case-by-style spread, so it is a lower bound. The standard deviation of the six paired per-case visible-ratio differences (ablated minus before, mean +0.057) is 0.118. A 12-case paired comparison would have se = 0.118 / sqrt(12) = 0.034 and a 95% half-width of 2.201 x 0.034 = 0.075, so a before/after difference smaller than 0.075 could not exclude zero. This rests on six cases of one ablation.

## Result

| Measure | Before | After | n | Answers per case | Interval |
| --- | --- | --- | --- | --- | --- |
| median visible ratio | 0.457 | no edit | 12 | 2 | none printed |
| mean visible ratio | 0.507 | no edit | 12 | 2 | ci95 0.365..0.650 |
| facts_kept strict | 58.3% (14 of 24 answers) | no edit | 12 | 2 | none printed |
| facts_share | 60.8% | no edit | 12 | 2 | none printed |
| question_last | 87.5% | no edit | 12 | 2 | none printed |
| lines with failed=labels | 0 | no edit | 12 | 2 | none printed |
| billed_median | 0.960 | no edit | 12 | 2 | none printed |

Goals of the request:

1. Visible length at most 0.45: missed (0.457).
2. Facts at least 60%: missed (58.3%).
3. question_last at least 75% and no failed=labels line: met (87.5%; 0 of the 12 case lines in the before output carry failed=labels).
4. Before/after difference with an interval that excludes zero: missed (no edit, no after run).
5. Billed tokens shown apart and not rising: shown apart, met; not rising, no after figure.
6. `npm run check`: run by the lead after this task; its result is recorded in the commit, not here.

Paid total: $2.9088 of the $5 cap, $2.0912 unspent (ledger `.exo/adhd-proof/progress.md`).

Earlier 0.704: that figure was billed tokens on claude-opus-5-5; the visible median there was 0.465 (`.exo/adhd-proof/spec-result.md`, claim 1).

Verified against assumed:

- Verified: the before figures above, read from the run records under `.exo/adhd-score/` and the run output.
- Agent-made: the 12 facts labels are agent-made, not user-made. 25 older labels are of unknown origin. Kappa 0.93 (lower bound 0.81) on 37 rows shows agreement with an agent, not with the user.
- Assumed: the power line treats cases as having no case-by-style interaction. The record stores only the first answer's text per case and `failed`/`missing` as a union over both answers. The claude-opus-5-5 figures of earlier rounds are not comparable with these claude-fable-5-2 figures.
