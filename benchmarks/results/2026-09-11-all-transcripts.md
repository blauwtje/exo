# Benchmark 2026-09-11, rescored over every transcript

The 96 cells of `benchmarks/results/2026-09-11.md`, rescored after `node benchmarks/backfill-usage.mjs benchmarks/runs/2026-09-11-full` wrote `usage.json` into each cell from its surviving transcripts. Tokens now sum the main thread and every subagent transcript; `2026-09-11.md` counted the main thread only and stays as printed.

## `node benchmarks/score.mjs benchmarks/runs/2026-09-11-full`

model claude-haiku-4-5-20251001 · Claude Code 2.1.268 (Claude Code) · fixture full-stack-fastapi-template@cd83fc1 · n=4 · 2026-09-11

| arm | LOC | tokens | cost | time | safe | correct | right-sizing |
|---|---|---|---|---|---|---|---|
| baseline | 413 ±460 | 108k ±55k | $0.17 ±0.10 | 2.2m ±1.6m | - | 100% (48/48) | 0% (0/48) |
| exo | 309 ±315 (-25%) | 132k ±60k (22%) | $0.21 ±0.10 (24%) | 2.0m ±1.4m (-8%) | - | 96% (46/48) | 4% (2/48) |

- baseline: cost per correct cell claude-haiku-4-5-20251001 $0.168; subagents none; ladder in context 0% (0/48)
- exo: cost per correct cell claude-haiku-4-5-20251001 $0.174, claude-sonnet-5 $0.034; subagents exo:codebase-scout 25/48; ladder in context 0% (0/48)

## Ratios with their standard error

`--publish` written to temporary files only, so `skills/savings/scripts/ratios.mjs` is unchanged by this rescore. A negative ratio means the exo arm used more than the baseline.

| metric | ratio | spread |
|---|---|---|
| lines | 0.25 | 0.16 |
| tokens | -0.22 | 0.12 |
| cost | -0.24 | 0.14 |
| time | 0.08 | 0.13 |
