# Ideas results: spec-cliches

Decision rule, fixed before any score:
- A1 (wider sketch with fixed roles) needed when mean shapes < 3 or mean originality < 3.
- A2 (one subagent per candidate) needed when mean duplicateShare >= 0.2.
- A3 (code-cliche list) needed when mean modalShare >= 0.6 or mean rare < 0.2.
- Needed means worth a variant arm; adoption waits for that arm to beat baseline by more than the minimum detectable effect.

Judge calibration: 0.917 of control scores within 1 of the key, calibrated

| metric | mean | sd | n | minimum detectable effect |
| --- | --- | --- | --- | --- |
| strong | 0 | 0 | 15 | n/a (sd 0) |
| options | 3.8 | 0.561 | 15 | 0.581 |
| shapes | 3.8 | 0.561 | 15 | 0.581 |
| duplicateShare | 0 | 0 | 15 | n/a (sd 0) |
| originality | 1.398 | 0.315 | 15 | 0.327 |
| fit | 3.529 | 0.302 | 15 | 0.313 |
| rare | 0 | 0 | 15 | n/a (sd 0) |

At a floor or ceiling (sd 0, no detectable effect): strong 0, duplicateShare 0, rare 0

modalShare per case: notes 1, shopping 0.8, tide 0.6

Decision:
- A1 wider sketch with fixed roles: needed (mean shapes 3.8, mean originality 1.3977777777777776)
- A2 one subagent per candidate: not needed (mean duplicateShare 0)
- A3 code-cliche list: needed (mean modalShare 0.7999999999999999, mean rare 0)

Failed runs, left out of every metric and n: none

Unscored items: none

## Runs

| case | run | options | shapes | duplicateShare | originality | fit | strong | rare | recommendedShape |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| notes | 1 | 3 | 3 | 0 | 1.333 | 3.333 | 0 | 0 | 0 |
| notes | 2 | 4 | 4 | 0 | 1.25 | 3 | 0 | 0 | 0 |
| notes | 3 | 4 | 4 | 0 | 1.25 | 3.25 | 0 | 0 | 0 |
| notes | 4 | 4 | 4 | 0 | 1 | 3.75 | 0 | 0 | 0 |
| notes | 5 | 3 | 3 | 0 | 1.667 | 3 | 0 | 0 | 0 |
| shopping | 1 | 4 | 4 | 0 | 1 | 3.5 | 0 | 0 | 3 |
| shopping | 2 | 3 | 3 | 0 | 1 | 4 | 0 | 0 | 3 |
| shopping | 3 | 4 | 4 | 0 | 1.25 | 3.5 | 0 | 0 | 1 |
| shopping | 4 | 3 | 3 | 0 | 1.667 | 4 | 0 | 0 | 3 |
| shopping | 5 | 4 | 4 | 0 | 1 | 3.5 | 0 | 0 | 3 |
| tide | 1 | 4 | 4 | 0 | 1.75 | 3.5 | 0 | 0 | 2 |
| tide | 2 | 4 | 4 | 0 | 1.75 | 3.5 | 0 | 0 | 2 |
| tide | 3 | 4 | 4 | 0 | 1.5 | 3.75 | 0 | 0 | 1 |
| tide | 4 | 5 | 5 | 0 | 1.8 | 3.6 | 0 | 0 | 2 |
| tide | 5 | 4 | 4 | 0 | 1.75 | 3.75 | 0 | 0 | 1 |

## Compare to base

`node benchmarks/ideas.mjs --compare /Users/thomash/Documents/Code/personal/plugins/exo/.exo/ideation-bench/runs/base/base /Users/thomash/Documents/Code/personal/plugins/exo/.exo/ideation-bench/runs/spec-cliches/spec-cliches`

| metric | diff | two SE | verdict |
| --- | --- | --- | --- |
| strong | 0 | 0 | noise |
| options | -0.2 | 0.349 | noise |
| shapes | -0.2 | 0.349 | noise |
| duplicateShare | 0 | 0 | noise |
| originality | 0.001 | 0.249 | noise |
| fit | 0.044 | 0.238 | noise |
| rare | -0.047 | 0.05 | noise |
