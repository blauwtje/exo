# Compression: measured token savings of off, low and high

This file scores Task 21 of `docs/specs/simpler-cheaper-exo.md`: `high` should write at least 35% fewer output tokens than `off`, `low` should read at least 25% fewer input tokens on a test-heavy run, at the same pass rate. Measured at 60c20aea. Neither threshold is met.

## Method

- Case: `benchmarks/pressure/compression/a-test-heavy.txt`, fixture from `benchmarks/pressure/compression/setup.sh`: a Node checkout whose `npm test` prints 3,974 TAP lines (86 KB) with 18 failures from `Math.floor(amount * 100)`. Pass criterion in `benchmarks/pressure/compression/criteria.md`.
- Level: `CLAUDE_PLUGIN_OPTION_COMPRESSION=<level>` in the runner's environment. Every transcript's settings line read `compression=<level> (global)`, so each level took effect.
- Runner, once per level, both arms loading this checkout, so each level gives 4 runs:

```
CLAUDE_PLUGIN_OPTION_COMPRESSION=<level> node skills/edit-skills/scripts/pressure.mjs --prompt benchmarks/pressure/compression/a-test-heavy.txt --cells sonnet:medium --plugin-dir . --main-dir . --setup <wrapper>/compression/setup.sh --runs 2
```

- `<wrapper>/compression/setup.sh` grades and archives the last run's fixture (`npm test` exit, `git diff HEAD -- test`, `git diff HEAD -- src`), then runs the case's own `setup.sh`.
- Tokens: `in` = input + cache creation + cache read, `out` = output, both from `pressure.mjs` `[tokens:]` lines.

## Results

| level | runs | passes | in (main + with) | out (main + with) | cost |
|---|---|---|---|---|---|
| off | 4 | 4 | 133315 + 117912 = 251227 | 2059 + 1944 = 4003 | $0.1778 |
| low | 4 | 4 | 135081 + 134181 = 269262 | 1958 + 1753 = 3711 | $0.1819 |
| high | 4 | 4 | 152137 + 120391 = 272528 | 1935 + 1616 = 3551 | $0.1834 |

- `high` vs `off` output: 11.3% fewer (threshold 35%): not met.
- `low` vs `off` input: 7.2% more (threshold 25% fewer): not met.
- Pass rate: 4/4 at every level: met.
- Total pressure cost: $0.5946, including one $0.0515 calibration run that confirmed the environment variable sets the level.

## Why low saves no input

The tool-output wrapper in `lib/compress-output.mjs` wraps only a plain command; any pipe leaves it untouched. In all 12 runs Sonnet ran `npm test` only as `npm test 2>&1 | tail -40` or `npm test 2>&1 | grep '^not ok'`, so the wrapper fired 0 times and every run already read under 1.4 KB of test output per call. Input is dominated by the session context (about 14k tokens per turn), and the differences between levels are turn-count noise (59k or 75k per run).

## Why high saves little output

Output tokens include tool calls and the edit, not only the closing reply. The closing explanation is a small share of about 1,000 output tokens per run, so dropping articles and linking verbs from it saves about 110 tokens a run.

## Decision

- `high` is removed: it cost $0.1834 against `off` at $0.1778 at the same 4/4 pass rate, so it cost more and saved little output.
- The tool-output wrapper is removed: it fired 0 times, and its rule text made `low` cost more than `off`.
- `low` is kept without a new measurement: after the wrapper removal it is the old `tight` reply behavior.
