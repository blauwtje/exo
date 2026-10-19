# Ideas results: spec-tail

Decision rule, fixed before any score:
- A1 (wider sketch with fixed roles) needed when mean shapes < 3 or mean originality < 3.
- A2 (one subagent per candidate) needed when mean duplicateShare >= 0.2.
- A3 (code-cliche list) needed when mean modalShare >= 0.6 or mean rare < 0.2.
- Needed means worth a variant arm; adoption waits for that arm to beat baseline by more than the minimum detectable effect.

Judge calibration: 0.917 of control scores within 1 of the key, calibrated

| metric | mean | sd | n | minimum detectable effect |
| --- | --- | --- | --- | --- |
| strong | 0.067 | 0.258 | 15 | 0.268 |
| options | 3.067 | 0.258 | 15 | 0.268 |
| shapes | 3.067 | 0.258 | 15 | 0.268 |
| duplicateShare | 0 | 0 | 15 | n/a (sd 0) |
| originality | 1.956 | 0.396 | 15 | 0.41 |
| fit | 3.711 | 0.33 | 15 | 0.342 |
| rare | 0.044 | 0.117 | 15 | 0.122 |
| recommendedOriginality | 1.133 | 0.352 | 15 | 0.365 |
| recommendedFit | 4.133 | 0.352 | 15 | 0.365 |
| tokens | 226275.867 | 191587.635 | 15 | 198680.473 |
| costUsd | 0.366 | 0.238 | 15 | 0.247 |

At a floor or ceiling (sd 0, no detectable effect): duplicateShare 0

modalShare per case: notes 0.6, shopping 0.8, tide 0.6

Decision:
- A1 wider sketch with fixed roles: needed (mean shapes 3.066666666666667, mean originality 1.9555555555555555)
- A2 one subagent per candidate: not needed (mean duplicateShare 0)
- A3 code-cliche list: needed (mean modalShare 0.6666666666666666, mean rare 0.04444444444444444)

Failed runs, left out of every metric and n: none

Unscored items: none

## Runs

| case | run | options | shapes | duplicateShare | originality | fit | strong | rare | recommendedShape | recommendedOriginality | recommendedFit | tokens | costUsd |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| notes | 1 | 3 | 3 | 0 | 2.667 | 3.333 | 0 | 0.333 | 6 | 1 | 4 | 89372 | 0.186 |
| notes | 2 | 3 | 3 | 0 | 2.333 | 4 | 1 | 0 | 4 | 1 | 4 | 91770 | 0.235 |
| notes | 3 | 3 | 3 | 0 | 2 | 3.333 | 0 | 0.333 | 0 | 1 | 4 | 89242 | 0.18 |
| notes | 4 | 3 | 3 | 0 | 2 | 3.667 | 0 | 0 | 0 | 1 | 4 | 348247 | 0.508 |
| notes | 5 | 3 | 3 | 0 | 2.333 | 3 | 0 | 0 | 0 | 2 | 4 | 267779 | 0.422 |
| shopping | 1 | 3 | 3 | 0 | 1.667 | 3.667 | 0 | 0 | 3 | 1 | 4 | 542331 | 0.683 |
| shopping | 2 | 4 | 4 | 0 | 1 | 4 | 0 | 0 | 1 | 1 | 5 | 426372 | 0.628 |
| shopping | 3 | 3 | 3 | 0 | 1.667 | 4 | 0 | 0 | 1 | 1 | 4 | 68060 | 0.181 |
| shopping | 4 | 3 | 3 | 0 | 1.667 | 4.333 | 0 | 0 | 1 | 1 | 5 | 67720 | 0.177 |
| shopping | 5 | 3 | 3 | 0 | 1.667 | 3.667 | 0 | 0 | 1 | 1 | 4 | 485587 | 0.761 |
| tide | 1 | 3 | 3 | 0 | 2 | 3.667 | 0 | 0 | 2 | 1 | 4 | 90299 | 0.199 |
| tide | 2 | 3 | 3 | 0 | 2.333 | 4 | 0 | 0 | 4 | 2 | 4 | 89181 | 0.173 |
| tide | 3 | 3 | 3 | 0 | 2 | 3.667 | 0 | 0 | 2 | 1 | 4 | 557897 | 0.773 |
| tide | 4 | 3 | 3 | 0 | 2 | 3.667 | 0 | 0 | 2 | 1 | 4 | 89022 | 0.172 |
| tide | 5 | 3 | 3 | 0 | 2 | 3.667 | 0 | 0 | 4 | 1 | 4 | 91259 | 0.213 |
