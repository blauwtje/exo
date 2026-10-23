# Pressure grade: the exo:adhd style against the default style on the compression case

Records `pressure.mjs --grade --contrast-style exo:adhd,default` on `benchmarks/pressure/compression/a-test-heavy.txt` (Decisions 10 to 12 of `docs/specs/adhd-style.md`).

Output token cut: 41.6%

## Method

- Arms: both load this checkout as the plugin; the `with` arm sets `outputStyle` to `exo:adhd`, the `contrast` arm to `default`. Each run's init event reported its arm's style (no `WRONG STYLE`).
- Cell: `sonnet:medium`, 5 runs per arm, threshold 1 (default), judge cell `sonnet:low` (default), 3 judge votes per line. The fixture comes from `bash benchmarks/pressure/compression/setup.sh`.
- Command, after `bash benchmarks/pressure/compression/setup.sh`:

```
node skills/edit-skills/scripts/pressure.mjs --prompt benchmarks/pressure/compression/a-test-heavy.txt --cells sonnet:medium --plugin-dir . --setup benchmarks/pressure/compression/setup.sh --grade --runs 5 --contrast-style exo:adhd,default
```

- Target (Decision 11): the style arm's summed output tokens are at most 70% of the default arm's, and its graded pass rate is at least the default arm's.
- Rounds (Decision 12), same command and cell, summed output tokens over 5 runs per arm:

| round | style file | adhd out | default out | adhd / default | target |
|---|---|---|---|---|---|
| 0 | no tightening | 4758 | 5855 | 81.3% | missed |
| 1 | after `d9381450` | 4529 | 6197 | 73.1% | missed |
| 2 | after `1872b102` (final) | 3444 | 5893 | 58.4% | holds |

The per-line grades and the result below are from round 2.

## Per-line grades

Lines in criteria order: (1) `npm test` exits 0, (2) no test file changed, (3) `src/money.js` changed, (4) answer names `toCents` flooring `amount * 100` as the cause (judge), (5) answer says the product can land slightly below the whole number (judge), (6) answer names no cause other than the flooring (judge). P = pass, F = fail. A trailing `U<n>` marks line n as `UNSTABLE JUDGE` (votes agree under 0.8).

| arm | run | 1 | 2 | 3 | 4 | 5 | 6 | run passes | out tokens | cost | unstable |
|---|---|---|---|---|---|---|---|---|---|---|---|
| default | 1 | P | P | P | P | F | F | no | 1081 | $0.0489 | U6 |
| default | 2 | P | P | P | P | F | F | no | 1191 | $0.0510 | |
| default | 3 | P | P | P | P | P | F | no | 1297 | $0.0485 | U4 U6 |
| default | 4 | P | P | P | P | F | P | no | 1070 | $0.0473 | U6 |
| default | 5 | P | P | P | P | F | F | no | 1254 | $0.0569 | |
| adhd | 1 | P | P | P | P | F | P | no | 574 | $0.0392 | U6 |
| adhd | 2 | P | P | P | F | P | P | no | 716 | $0.0449 | U4 |
| adhd | 3 | P | P | P | P | F | P | no | 700 | $0.0428 | U6 |
| adhd | 4 | P | P | P | P | P | F | no | 691 | $0.0427 | |
| adhd | 5 | P | P | P | P | F | P | no | 763 | $0.0469 | |

- Deterministic lines (1 to 3): 30/30 pass across both arms.
- No run passes all six lines in either arm. Line 5 fails in 4 of 5 default runs and 3 of 5 adhd runs; line 6 fails in 4 of 5 default runs and 1 of 5 adhd runs. The judge reason on adhd run 1, line 5 contradicts its own verdict (it says the example meets the rubric, then records FAIL), so line 5 is a noisy line.
- Seven judge lines print `UNSTABLE JUDGE` in the final run (adhd runs 1, 2, 3; default runs 1, 3 twice, 4). Rounds 0 and 1 print four each.

## Result

| arm | pass rate | output tokens (5 runs) | input tokens | cost |
|---|---|---|---|---|
| default (`contrast`) | 0/5 = 0% | 5893 | 477313 | $0.2527 |
| exo:adhd (`with`) | 0/5 = 0% | 3444 | 432702 | $0.2166 |

`sonnet:medium a-test-heavy.txt: with 0% contrast 0% delta +0% ci [-43%, +43%] margin 20% INCONCLUSIVE (16 runs per arm would decide at these rates)`

- Output tokens: style arm 3444 vs default arm 5893 = 58.4% of default, a cut of 41.6%. The target of at most 70% holds.
- Pass rate: equal (0% vs 0%), so "at least the default arm's" holds on paper. The grader did not separate the arms: every run fails at least one judge line in both arms, the verdict is INCONCLUSIVE with an interval of [-43%, +43%], and the judge was unstable on several lines. The pass-rate check is weak and shows no loss in answer quality only to the extent the 0% vs 0% rate can.
- Rounds 0 and 1 also graded `with 0% contrast 0%` INCONCLUSIVE.
