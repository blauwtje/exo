# Ideas results: spec-roles

Decision rule, fixed before any score:
- A1 (wider sketch with fixed roles) needed when mean shapes < 3 or mean originality < 3.
- A2 (one subagent per candidate) needed when mean duplicateShare >= 0.2.
- A3 (code-cliche list) needed when mean modalShare >= 0.6 or mean rare < 0.2.
- Needed means worth a variant arm; adoption waits for that arm to beat baseline by more than the minimum detectable effect.

Judge calibration: 0.917 of control scores within 1 of the key, calibrated

| metric | mean | sd | n | minimum detectable effect |
| --- | --- | --- | --- | --- |
| strong | 0 | 0 | 15 | n/a (sd 0) |
| options | 4.467 | 0.516 | 15 | 0.536 |
| shapes | 4.467 | 0.516 | 15 | 0.536 |
| duplicateShare | 0 | 0 | 15 | n/a (sd 0) |
| originality | 1.447 | 0.264 | 15 | 0.273 |
| fit | 3.32 | 0.308 | 15 | 0.32 |
| rare | 0 | 0 | 15 | n/a (sd 0) |

At a floor or ceiling (sd 0, no detectable effect): strong 0, duplicateShare 0, rare 0

modalShare per case: notes 1, shopping 0.6, tide 1

Decision:
- A1 wider sketch with fixed roles: needed (mean shapes 4.466666666666667, mean originality 1.4466666666666668)
- A2 one subagent per candidate: not needed (mean duplicateShare 0)
- A3 code-cliche list: needed (mean modalShare 0.8666666666666667, mean rare 0)

Failed runs, left out of every metric and n: none

Unscored items: none

## Runs

| case | run | options | shapes | duplicateShare | originality | fit | strong | rare | recommendedShape |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| notes | 1 | 5 | 5 | 0 | 1 | 2.8 | 0 | 0 | 5 |
| notes | 2 | 4 | 4 | 0 | 1.5 | 2.75 | 0 | 0 | 5 |
| notes | 3 | 5 | 5 | 0 | 1.4 | 3 | 0 | 0 | 5 |
| notes | 4 | 4 | 4 | 0 | 1 | 3.5 | 0 | 0 | 5 |
| notes | 5 | 5 | 5 | 0 | 1.4 | 3 | 0 | 0 | 5 |
| shopping | 1 | 5 | 5 | 0 | 1.4 | 3.6 | 0 | 0 | 0 |
| shopping | 2 | 4 | 4 | 0 | 1.25 | 3.5 | 0 | 0 | 2 |
| shopping | 3 | 5 | 5 | 0 | 1.4 | 3.4 | 0 | 0 | 2 |
| shopping | 4 | 5 | 5 | 0 | 1.2 | 3.2 | 0 | 0 | 0 |
| shopping | 5 | 5 | 5 | 0 | 1.4 | 3.8 | 0 | 0 | 0 |
| tide | 1 | 4 | 4 | 0 | 1.75 | 3.5 | 0 | 0 | 3 |
| tide | 2 | 4 | 4 | 0 | 1.75 | 3.5 | 0 | 0 | 3 |
| tide | 3 | 4 | 4 | 0 | 1.75 | 3.25 | 0 | 0 | 3 |
| tide | 4 | 4 | 4 | 0 | 1.75 | 3.5 | 0 | 0 | 3 |
| tide | 5 | 4 | 4 | 0 | 1.75 | 3.5 | 0 | 0 | 3 |

## Compare to base

Command:

```
node benchmarks/ideas.mjs --compare /Users/thomash/Documents/Code/personal/plugins/exo/.exo/ideation-bench/runs/base/base /Users/thomash/Documents/Code/personal/plugins/exo/.exo/ideation-bench/runs/spec-roles/spec-roles
```

Output:

| metric | diff | two SE | verdict |
| --- | --- | --- | --- |
| strong | 0 | 0 | noise |
| options | 0.467 | 0.33 | rise |
| shapes | 0.467 | 0.33 | rise |
| duplicateShare | 0 | 0 | noise |
| originality | 0.05 | 0.233 | noise |
| fit | -0.164 | 0.241 | noise |
| rare | -0.047 | 0.05 | noise |

