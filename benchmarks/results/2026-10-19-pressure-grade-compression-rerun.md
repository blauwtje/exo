# Pressure grade: compression case rerun after the judge line fix

Reruns `pressure.mjs --grade` on `benchmarks/pressure/compression/a-test-heavy.txt` exactly as `2026-10-19-pressure-grade-compression.md` ran it, after commit `8e8d9b1f` reworded the line 4 judge criterion in `benchmarks/pressure/compression/criteria.md` (it no longer says "no other cause" than floating-point rounding; it names `toCents` flooring the float product as the one cause).

## Method

- Same setting, cell, runs, threshold, judge cell and arms as the earlier file: `CLAUDE_PLUGIN_OPTION_COMPRESSION=high`, `sonnet:medium`, 3 runs per arm, threshold 1 (default), judge cell `sonnet:low` (default). Without arm = no plugin; with arm = this checkout.
- Command:

```
CLAUDE_PLUGIN_OPTION_COMPRESSION=high node skills/edit-skills/scripts/pressure.mjs --prompt benchmarks/pressure/compression/a-test-heavy.txt --cells sonnet:medium --plugin-dir . --setup benchmarks/pressure/compression/setup.sh --runs 3 --grade
```

## Per-line grades

Lines in criteria order: (1) `npm test` exits 0, (2) no test file changed, (3) `src/money.js` changed, (4) answer names `toCents` flooring the float product as the cause and no unrelated cause (judge). P = pass, F = fail.

| arm | run | 1 | 2 | 3 | 4 | run passes | cost |
|---|---|---|---|---|---|---|---|
| without | 1 | P | P | P | F | no | $0.0393 |
| without | 2 | P | P | P | P | yes | $0.0331 |
| without | 3 | P | P | P | P | yes | $0.0393 |
| with | 1 | P | P | P | F | no | $0.0619 |
| with | 2 | P | P | P | P | yes | $0.0643 |
| with | 3 | P | P | P | P | yes | $0.0577 |

- Without run 1 line 4 judge reason: the answer names flooring with float error (0.29 gives 28.999...) but also says "the amounts are already given in whole cents", which the judge read as an unrelated, contradicting claim.
- With run 1 line 4 judge reason: the answer names flooring after float error, but its sentence "Some decimals do not times out to a whole number" is garbled and does not clearly say the product comes out slightly low; the judge failed it as doubtful.
- With run 3 and without run 3 name `Math.floor` as the cause and pass, so the fix removed the earlier failure mode (floor read as a second cause).

## Result

| arm | pass rate | threshold 1 |
|---|---|---|
| without | 2/3 = 67% | fail |
| with | 2/3 = 67% | fail |

`sonnet:medium a-test-heavy.txt: with 67% without 67% delta +0% FAIL`

- Deterministic lines (1 to 3): 18/18 pass across all runs.
- Each arm has one failed judge verdict on line 4, each on a claim outside the cause, not on `floor`. The case still reports FAIL because both arms sit below threshold 1, but the delta is 0: no skill effect shows.
- Total cost: without $0.1116, with $0.1839 (both arms $0.2955).
