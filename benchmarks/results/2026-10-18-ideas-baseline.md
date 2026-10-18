# Ideas results: base

Decision rule, fixed before any score:
- A1 (wider sketch with fixed roles) needed when mean shapes < 3 or mean originality < 3.
- A2 (one subagent per candidate) needed when mean duplicateShare >= 0.2.
- A3 (code-cliche list) needed when mean modalShare >= 0.6 or mean rare < 0.2.
- Needed means worth a variant arm; adoption waits for that arm to beat baseline by more than the minimum detectable effect.

Judge calibration: 0.917 of control scores within 1 of the key, calibrated

| metric | mean | sd | n | minimum detectable effect |
| --- | --- | --- | --- | --- |
| strong | 0 | 0 | 15 | n/a (sd 0) |
| options | 4 | 0.378 | 15 | 0.392 |
| shapes | 4 | 0.378 | 15 | 0.392 |
| duplicateShare | 0 | 0 | 15 | n/a (sd 0) |
| originality | 1.397 | 0.365 | 15 | 0.379 |
| fit | 3.484 | 0.349 | 15 | 0.362 |
| rare | 0.047 | 0.097 | 15 | 0.101 |

At a floor or ceiling (sd 0, no detectable effect): strong 0, duplicateShare 0

modalShare per case: notes 1, shopping 0.8, tide 1

Decision:
- A1 wider sketch with fixed roles: needed (mean shapes 4, mean originality 1.3966666666666667)
- A2 one subagent per candidate: not needed (mean duplicateShare 0)
- A3 code-cliche list: needed (mean modalShare 0.9333333333333332, mean rare 0.04666666666666666)

Failed runs, left out of every metric and n: none

Unscored items: none

## Runs

| case | run | options | shapes | duplicateShare | originality | fit | strong | rare | recommendedShape |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| notes | 1 | 4 | 4 | 0 | 1.5 | 3 | 0 | 0 | 3 |
| notes | 2 | 4 | 4 | 0 | 1 | 3.25 | 0 | 0 | 3 |
| notes | 3 | 4 | 4 | 0 | 1 | 3.5 | 0 | 0 | 3 |
| notes | 4 | 4 | 4 | 0 | 1 | 3.75 | 0 | 0 | 3 |
| notes | 5 | 5 | 5 | 0 | 1.2 | 2.6 | 0 | 0.2 | 3 |
| shopping | 1 | 4 | 4 | 0 | 1.25 | 3.75 | 0 | 0 | 0 |
| shopping | 2 | 4 | 4 | 0 | 1.25 | 3.5 | 0 | 0 | 3 |
| shopping | 3 | 4 | 4 | 0 | 1.25 | 3.25 | 0 | 0 | 0 |
| shopping | 4 | 4 | 4 | 0 | 1.25 | 3.75 | 0 | 0 | 0 |
| shopping | 5 | 4 | 4 | 0 | 1 | 4 | 0 | 0 | 0 |
| tide | 1 | 4 | 4 | 0 | 2 | 3.75 | 0 | 0.25 | 0 |
| tide | 2 | 4 | 4 | 0 | 1.75 | 3.5 | 0 | 0.25 | 0 |
| tide | 3 | 4 | 4 | 0 | 1.75 | 3.5 | 0 | 0 | 0 |
| tide | 4 | 3 | 3 | 0 | 2 | 3.667 | 0 | 0 | 0 |
| tide | 5 | 4 | 4 | 0 | 1.75 | 3.5 | 0 | 0 | 0 |
