# design-ui round 3: rewrite against impeccable, with a recalibrated judge

Records the round-3 work on `exo:design-ui`: a new pairwise judge and its calibration, two skill rounds on the `game-launcher` and `social` tasks, and the shipped version's cost and time against target. The user judged impeccable far above design-ui in the two earlier rounds; that verdict is the ground truth this round calibrates against.

Judge ranking is not validated. Rubric v5 matched the user on 4/4 round-1 pairs it was derived from and 0/2 held-out round-2 pairs, both orders. The user's eye ranks; every judge column below is descriptive only.

## Research

Sources read (by name only, ideas restated in exo's words, nothing copied): pbakaus/impeccable, Leonxlnx/taste-skill, Nutlope/hallmark, Ilm-Alan/frontend-design, anthropics/claude-code frontend-design, anthropics/skills, nextlevelbuilder/ui-ux-pro-max-skill, aladicf/better-web-ui, addyosmani/agent-skills, coreyhaines31/marketingskills, VoltAgent/awesome-design-md, nexu-io/open-design, zarazhangrui/frontend-slides, claude-skills by Ramp Stack Co, garrytan/gstack design-review, Tencent-Hunyuan/ArtifactsBenchmark, lcy2723/WebDevJudge, NoviScl/Design2Code, mnluzimu/WebGen-Bench, google-research-datasets/uicrit, dani-z/frontend-design-skill-benchmark.

- Strong generators take the direction choice away from the model's default taste: a script deals a few directions and the model picks one with a reason.
- A short written contract (tokens, type roles, first screen, states, what to avoid) comes before any code.
- The page is grounded in the subject's own world: its materials, audience and real facts.
- Type carries the personality; display and body faces differ, and the usual default faces are avoided.
- Colour is chosen at page scale; timid single-accent pages read as thin on persuasive work.
- Critique uses a swap test (would another product's content fit unnoticed) and treats generic output as a hard fail, not a soft weight.
- Cheapest levers with the most gain: name the category's usual page and avoid it, dealt direction, a font and colour strategy, and a craft floor at build time. A fresh-context reviewer is affordable once per run, not in a loop.

## Judge calibration

Judge: `eval3/judge3.mjs`, claude-opus-5-5 only, one call per pair per order, a verdict counts only when both orders agree. Floors (render, readability, fidelity) are pass/fail; the other criteria pick A, B or tie. Calibration set: the 6 human-labelled pairs from the earlier rounds (impeccable expected to win each) plus 2 degradation controls (impeccable pages with system font and an indigo accent; the original expected to win).

| step | input | rubric | pass |
|---|---|---|---|
| tiles r1 to fix3 | 3 or 5 viewport tiles per width + digest | v1 to v4 | v4: 1/6 human pairs (3/8 with controls) |
| full-page | full-page images + digest | v4 unchanged | 5/8 incl. controls |
| v5 | full-page images + digest | v5, criteria from the round-1 human pairs | 4/4 training, 0/2 held-out, controls 2/2 |

Result: FAIL. On tiles the judge stayed stable across orders but preferred design-ui on most human pairs whatever the rubric wording. Full-page input exposed render defects that tiles hid, but did not change the quality calls. v5 fits the pairs it was written from and misses both held-out pairs. Judge work stopped there: the judge reports floors, controls and descriptive per-criterion readings, and the user ranks from the galleries. The judge returns to ranking only after 4 to 6 new blind user labels, at least 2 where the user expects design-ui to win.

## Pairwise judge readings (descriptive, unvalidated)

Rubric v5 (`48d48e4838a7`), full-page input, digest on, 2 orders. dui = design-ui, imp = impeccable. Floor cells: verdict (dui/imp status). Quality cells: verdict (order 1/order 2). Overall is shown for completeness and is not a ranking.

- Round 1: results8, design-ui at `67fe287d` + `ccad0347`.
- Round 2: results9, design-ui at `05795b07`; impeccable runs reused from results8.

| round | task | render | readability | fidelity | thumbnail | colour | scale | variety | density | type | subject | overall |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | game-launcher | dui (pass/fail) | dui (pass/fail) | dui (pass/fail) | dui (dui/dui) | dui (dui/dui) | dui (dui/dui) | dui (dui/dui) | dui (dui/dui) | dui (dui/dui) | dui (dui/dui) | dui (dui/dui) |
| 1 | social | tie (pass/pass) | tie (pass/pass) | tie (pass/pass) | dui (dui/dui) | dui (dui/dui) | dui (dui/dui) | dui (dui/dui) | imp (imp/imp) | dui (dui/dui) | imp (imp/imp) | dui (dui/dui) |
| 2 | game-launcher | dui (pass/fail) | dui (pass/fail) | tie (pass/split) | dui (dui/dui) | dui (dui/dui) | dui (dui/dui) | dui (dui/dui) | dui (dui/dui) | dui (dui/dui) | dui (dui/dui) | dui (dui/dui) |
| 2 | social | tie (pass/pass) | tie (pass/pass) | tie (pass/pass) | imp (imp/imp) | dui (dui/dui) | tie (imp/tie) | imp (imp/imp) | imp (imp/imp) | imp (imp/imp) | imp (imp/imp) | imp (imp/imp) |

The impeccable game-launcher page fails floors in both rounds: its run hit the 720 s cap and the page renders partly unstyled, so that pair compares against a truncated run. Judge cost per call: 17.3k to 22.4k billed tokens and 19 to 28 s (round 1: 17,252 / 17,417 / 22,428 / 22,184 tokens, 21 / 22 / 28 / 26 s; round 2: 17,399 / 17,643 / 22,156 / 22,343 tokens, 19 / 23 / 25 / 27 s).

## Per-run results

One run per arm per task; the run cap is 720 s.

| arm | task | round | wall s | billed tokens | timedOut | contrast |
|---|---|---|---|---|---|---|
| design-ui | game-launcher | 1 | 720.0 | 639,449 | true | pass |
| design-ui | social | 1 | 719.5 | 989,391 | false | pass |
| impeccable | game-launcher | 1 | 720.0 | 1,220,151 | true | fail |
| impeccable | social | 1 | 720.0 | 2,076,415 | true | pass |
| design-ui | game-launcher | 2 | 381.0 | 471,984 | false | pass |
| design-ui | social | 2 | 517.7 | 450,458 | false | pass |

## Targets for the shipped version (round 2 design-ui)

Targets come from the previous design-ui arm's means (`.exo/design-redo/results/scores.md`, 8 runs).

| target | result | number |
|---|---|---|
| mean billed tokens ≤ 981,074 | pass | 461,221 |
| mean wall time ≤ 408 s | FAIL | 449.3 s (game-launcher 381.0, social 517.7) |
| contrast passes on every run | pass | 2/2 |
| no run times out | pass | 0/2 |

Round 2 cut mean billed tokens from 814,420 to 461,221 and mean wall time from 719.8 s to 449.3 s against round 1.

## Left over

- Mean wall time misses the 408 s target by 41 s; the social run alone takes 517.7 s.
- The judge cannot rank: v5 failed both held-out pairs. The ranking rests on the user's review of `.exo/design-redo/results8/gallery.html` and `.exo/design-redo/results9/gallery.html`.
- On social, round 2 reads worse than round 1 in the descriptive judge columns: impeccable takes thumbnail, variety, density, type, subject and overall; design-ui keeps only colour.
- Both impeccable runs and one design-ui round-1 run hit the 720 s cap, so the round-1 pairs compare capped work; n = 1 run per arm per task supports no claim about either skill in general.
