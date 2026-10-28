# DeepSeek effort sweep: deepseek-flash at low, high and max (2026-10-28)

Quick tier, 1 repeat, provider `deepseek` (model `deepseek-flash`, DeepSeek-V4.1-Flash), branch `bench/sweep-deepseek`. Raw runs: `benchmarks/runs/2026-10-28-deepseek-effort/` and `benchmarks/runs/2026-10-28-deepseek-effort-fixer/` in the worktree (gitignored). Batch log: `.exo/deepseek-effort/batches.tsv`; per-batch logs: `.exo/deepseek-effort/<set>-<effort>.log`.

## Table

$ = DeepSeek balance delta for the batch, to the cent (record `costUsd` is about 10x too high, see findings). Tokens = sum of record `tokens` over the batch's cells. Wall = slowest cell in the batch.

| Set (cells) | Effort | Score | $ | Tokens | Wall |
|---|---|---|---|---|---|
| review (2 seeded, 2 control) | low | 2/2 seeded found, 0 false alarms | 0.00 | 127k | 52 s |
| review | high | 2/2 seeded found, 0 false alarms | 0.00 | 123k | 45 s |
| review | max | 2/2 seeded found, 0 false alarms | 0.05 | 214k | 101 s |
| build (safe-path, sql-user) | low | 2/2 check pass | 0.00 | 44k | 26 s |
| build | high | 2/2 check pass | 0.07 | 48k | 57 s |
| build | max | 2/2 check pass | 0.12 | 61k | 121 s |
| fixer (safe-path, sql-user), run 1 | low | self-report fixed=1 on 2/2, unverified | 0.06 | 235k | 121 s |
| fixer, run 1 | high | self-report fixed=1 on 2/2, unverified | 0.10 | 284k | 107 s |
| fixer, run 1 | max | self-report fixed=1 on 2/2, unverified | 0.21 | 400k | 199 s |
| fixer, rerun with `--keep-repo` | low | 2/2 safe check pass | 0.26 | 358k | 170 s |
| fixer, rerun | high | 2/2 safe check pass | 0.08 | 301k | 161 s |
| fixer, rerun | max | 1/2: safe-path BLOCKED, no fix | 0.10 | 103k | 94 s |
| plan (plan-opus) | low | brief, 4 tasks; lint 15 defects (stale scorer) | 0.05 | 77k | 115 s |
| plan | high | brief, 4 tasks; lint 15 defects (stale scorer) | 0.11 | 76k | 92 s |
| plan | max | brief, 4 tasks; lint 15 defects (stale scorer) | 0.10 | 88k | 133 s |
| flow (c7) | low | 4/4 landed, hidden check pass | 0.05 | 105k | 64 s |
| flow | high | 4/4 landed, hidden check pass | 0.09 | 114k | 83 s |
| flow | max | 4/4 landed, hidden check pass | 0.03 | 137k | 102 s |

Real spend: balance $14.05 at start, $12.50 at end, so $1.55 in total, including the $0.01 smoke test and drift from a concurrent `exo claude --provider deepseek` session (the balance fell $0.05 between two of my batches with nothing of mine running). Budget stop ($9.05) was not reached.

## Recommended effort per job

| Job | Effort | Why |
|---|---|---|
| review | high | Same score at every effort; high is the fastest and fewest tokens, $0.00 at cent resolution, and is the model default. max doubles tokens and wall for no gain. |
| build | low | 2/2 pass at every effort; low is $0.00, 26 s, against $0.12 and 121 s at max. |
| fixer | high | Only effort with 2/2 verified fixes and the lowest combined cost over both runs ($0.18 vs low $0.32, max $0.31). max blocked once. |
| plan | low | No score difference: every effort writes the same 4-task brief. low is cheapest; weak evidence until the plan scorer is fixed. |
| flow | low | 4/4 landed and hidden pass at every effort; low has the fewest tokens and the shortest wall. |

With n = 1 per cell and cent-level cost, every score ties across efforts except the one fixer block at max; the pick rests on tokens and wall. The one clear result: max costs more tokens and wall in every set and buys nothing measurable here.

## Findings

1. No cell hit `error_max_budget_usd`; every `stdout.json` has subtype `success`. The `--max-budget-usd` token-cap issue cut nothing short at quick tier. No cell hung.
2. Fixer cells cannot be scored from `diff.patch`: the fixer commits its fix, and `diff.patch` is `git diff --cached HEAD`, so it is empty. `measureCell` also scores fixer through `lintPlan` (4 defects, "no tasks"). Scored instead by rerunning with `--keep-repo /tmp/dsweep/kept` and running `benchmarks/safe/<task>/check.mjs` on the kept repo.
3. Plan scorer is stale: `exo:spec` now writes a brief to `docs/specs/<topic>.md` and stops at "Start the build now?", but `newestPlan` reads `docs/plans/`, so every record says `no plan file`. Linting the brief with `lintPlan` gives the same 15 defects at every effort (missing `## Context`, `## Final verification`, Walkthrough, and per-task Commit block, Plan-task trailer and steps). The plan set does not discriminate effort until the scorer reads the brief.
4. Flow lands 4/4 with 0/4 `Plan-task:` trailers at every effort: the hidden check passes, but tasks did not land through the run-unit loop as the build skill requires.
5. `fixer-safe-path` at max in the rerun returned `BLOCKED: no findings file exists in the checkout ... $CLAUDE_PLUGIN_ROOT is unset`; it looked only in the work tree for the report at `.git/branch-review.md`. The same cell passed (self-report) in run 1, so this is flakiness, not shown to be effort-bound.
6. Record `costUsd` is about 10x the real cost (flow low: record $0.64, balance delta $0.05), because Claude Code prices the unknown `deepseek-flash` at the Opus rate.
