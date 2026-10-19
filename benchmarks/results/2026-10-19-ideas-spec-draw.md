# Ideas results: spec-draw

Decision rule, fixed before any score:
- A1 (wider sketch with fixed roles) needed when mean shapes < 3 or mean originality < 3.
- A2 (one subagent per candidate) needed when mean duplicateShare >= 0.2.
- A3 (code-cliche list) needed when mean modalShare >= 0.6 or mean rare < 0.2.
- Needed means worth a variant arm; adoption waits for that arm to beat baseline by more than the minimum detectable effect.

Judge calibration: 0.917 of control scores within 1 of the key, calibrated

| metric | mean | sd | n | minimum detectable effect |
| --- | --- | --- | --- | --- |
| strong | 0 | 0 | 15 | n/a (sd 0) |
| options | 3.2 | 0.414 | 15 | 0.429 |
| shapes | 3 | 0 | 15 | n/a (sd 0) |
| duplicateShare | 0.05 | 0.104 | 15 | 0.107 |
| originality | 1.917 | 0.456 | 15 | 0.473 |
| fit | 3.7 | 0.295 | 15 | 0.306 |
| rare | 0.044 | 0.117 | 15 | 0.122 |
| recommendedOriginality | 1.333 | 0.488 | 15 | 0.506 |
| recommendedFit | 4 | 0 | 15 | n/a (sd 0) |
| tokens | 155084.8 | 124142.423 | 15 | 128738.346 |
| costUsd | 0.258 | 0.127 | 15 | 0.131 |

At a floor or ceiling (sd 0, no detectable effect): strong 0, shapes 3, recommendedFit 4

modalShare per case: notes 0.8, shopping 1, tide 0.6

Decision:
- A1 wider sketch with fixed roles: needed (mean shapes 3, mean originality 1.9166666666666667)
- A2 one subagent per candidate: not needed (mean duplicateShare 0.05)
- A3 code-cliche list: needed (mean modalShare 0.7999999999999999, mean rare 0.04444444444444444)

Failed runs, left out of every metric and n: none

Unscored items: none

## Runs

| case | run | options | shapes | duplicateShare | originality | fit | strong | rare | recommendedShape | recommendedOriginality | recommendedFit | tokens | costUsd |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| notes | 1 | 3 | 3 | 0 | 1.667 | 3.333 | 0 | 0 | 1 | 1 | 4 | 273095 | 0.371 |
| notes | 2 | 4 | 3 | 0.25 | 2.25 | 3.25 | 0 | 0 | 0 | 1 | 4 | 89821 | 0.191 |
| notes | 3 | 3 | 3 | 0 | 1.667 | 3.333 | 0 | 0 | 1 | 1 | 4 | 424934 | 0.512 |
| notes | 4 | 4 | 3 | 0.25 | 2.25 | 3.25 | 0 | 0 | 1 | 2 | 4 | 68366 | 0.191 |
| notes | 5 | 3 | 3 | 0 | 1.667 | 3.667 | 0 | 0 | 1 | 1 | 4 | 89434 | 0.183 |
| shopping | 1 | 3 | 3 | 0 | 2 | 4 | 0 | 0 | 1 | 2 | 4 | 113739 | 0.225 |
| shopping | 2 | 3 | 3 | 0 | 1.333 | 4 | 0 | 0 | 1 | 1 | 4 | 139778 | 0.24 |
| shopping | 3 | 3 | 3 | 0 | 1.667 | 4 | 0 | 0 | 1 | 2 | 4 | 112481 | 0.195 |
| shopping | 4 | 3 | 3 | 0 | 1.667 | 3.667 | 0 | 0.333 | 1 | 1 | 4 | 91998 | 0.216 |
| shopping | 5 | 4 | 3 | 0.25 | 1.25 | 4 | 0 | 0.333 | 1 | 2 | 4 | 113857 | 0.221 |
| tide | 1 | 3 | 3 | 0 | 2.333 | 3.667 | 0 | 0 | 4 | 1 | 4 | 89727 | 0.183 |
| tide | 2 | 3 | 3 | 0 | 1.667 | 4 | 0 | 0 | 0 | 1 | 4 | 88928 | 0.168 |
| tide | 3 | 3 | 3 | 0 | 2 | 4 | 0 | 0 | 0 | 1 | 4 | 449172 | 0.58 |
| tide | 4 | 3 | 3 | 0 | 2.333 | 3.667 | 0 | 0 | 0 | 1 | 4 | 90178 | 0.192 |
| tide | 5 | 3 | 3 | 0 | 3 | 3.667 | 0 | 0 | 3 | 2 | 4 | 90764 | 0.205 |
