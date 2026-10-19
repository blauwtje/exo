# Pressure grade: one real graded run on the compression case

Records `pressure.mjs --grade` on `benchmarks/pressure/compression/a-test-heavy.txt` (Task 8 of `docs/specs/pressure-grade.md`).

## Method

- Setting: `CLAUDE_PLUGIN_OPTION_COMPRESSION=high`, one of the three values `benchmarks/pressure/compression/criteria.md` names (`off`, `low`, `high`).
- Cell: `sonnet:medium`, 3 runs per arm, threshold 1 (default), judge cell `sonnet:low` (default). Without arm = no plugin; with arm = this checkout.
- Command:

```
CLAUDE_PLUGIN_OPTION_COMPRESSION=high node skills/edit-skills/scripts/pressure.mjs --prompt benchmarks/pressure/compression/a-test-heavy.txt --cells sonnet:medium --plugin-dir . --setup benchmarks/pressure/compression/setup.sh --runs 3 --grade
```

## Per-line grades

Lines in criteria order: (1) `npm test` exits 0, (2) no test file changed, (3) `src/money.js` changed, (4) answer names floating-point rounding as the only cause (judge). P = pass, F = fail.

| arm | run | 1 | 2 | 3 | 4 | run passes | cost |
|---|---|---|---|---|---|---|---|
| without | 1 | P | P | P | P | yes | $0.0321 |
| without | 2 | P | P | P | P | yes | $0.0384 |
| without | 3 | P | P | P | P | yes | $0.0425 |
| with | 1 | P | P | P | P | yes | $0.0558 |
| with | 2 | P | P | P | F | no | $0.0747 |
| with | 3 | P | P | P | P | yes | $0.0739 |

- With run 2, line 4 judge reason: the answer names binary floating-point rounding but also says the fix was changing `floor` to `round`, which the judge read as a second cause (`Math.floor`).

## Result

| arm | pass rate | threshold 1 |
|---|---|---|
| without | 3/3 = 100% | pass |
| with | 2/3 = 67% | fail |

`sonnet:medium a-test-heavy.txt: with 67% without 100% delta -33% FAIL`

- Deterministic lines (1 to 3): 18/18 pass across all runs.
- The only failure is one judge verdict on line 4. It is a strict reading: `toCents` floors, so naming `floor` alongside float rounding describes one bug. One failed judge verdict in 3 runs gives no basis to call the delta a skill effect.
- Total cost: without $0.1129, with $0.2044.
