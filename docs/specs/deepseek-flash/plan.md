# DeepSeek Flash: cheaper and faster at the same quality

## Goal
exo on DeepSeek V4.1 Flash runs cheaper and faster per task at a pass rate equal to the best measured effort, with every cost and speed change proven by a before/after figure.

## Verdict
Verdict: go
Objection: the 2026-10-28 sweep is n=1 per cell and its record `costUsd` reads about 10x high, so effort picks and cost proofs are noise until the repeat-3 sweep runs on the fixed cost figure.

## Decisions
1. Every kind stays on `deepseek-flash`; none moves to V4-Pro (user).
2. DeepSeek effort per kind is set from measurement, as the user approved (user).
3. Effort pick rule: per kind, the lowest of low, medium and high whose pass rate over 3 repeats equals the best; a tie goes to lower balance-delta cost, then lower wall (user).
4. Medium: DeepSeek maps `medium` to `high` (api-docs thinking_mode), so the sweep runs medium as its own arm to confirm it bills and scores like high, and the table writes `high`, never `medium`, for a kind whose pick is medium (exo decided).
5. Swept kinds: `build` (set build), `orchestrator` (set flow), `fix-review` (set fixer, `--keep-repo`). Kinds the research marks inferred or unmeasured that have no sweep set (`lookup`, `chore`, `investigate`, `research`, `improve-round`, `peer`, `peer-review`, `judge`, `doc-task`, `task-runner`) take the research proposal and are listed `unmeasured` in the results file (exo decided).
6. No key or quota: Task 1 sets the research proposal (build low, orchestrator low, fix-review high, lookup low, chore low, the rest high) and marks every swept kind `unmeasured` (user).
7. Fewer spawns, options: (a) on provider `deepseek` an orchestrator part with `Workers: 1` runs its single unit itself instead of spawning a worker; (b) fork dispatch for wave siblings, so each sibling bills the inherited prefix as hit tokens; (c) merge task-runner into the orchestrator for every one-task wave. Pick (a): smallest change, it covers the most common dispatch (spec and research send `Workers: 1` parts), each removed spawn saves one cold ~23k-token prefix plus one thinking turn, and it is measurable as Agent calls per flow cell; (b) stays a ledger option because it changes every wave, (c) changes the run loop on every provider (exo decided).
8. Prefix stability, options: (a) static `session-routing.md` and `session-rules.md` first, pointers and the settings line last in `hooks/session-start.mjs`; (b) drop the settings line from SessionStart. Pick (a): same bytes, no lost information, the stable 3.7 KB becomes a shared prefix across sessions (exo decided).
9. Output caps: Claude Code exposes only the session-wide `CLAUDE_CODE_MAX_OUTPUT_TOKENS`; the Agent tool and hooks carry no per-subagent cap. So the cap applies only to child sessions exo starts itself for mechanical kinds (`build-task`, `doc-task` in run-plan), and Task 4 first verifies the variable reaches DeepSeek as `max_tokens`; when it does not, Task 4 records "no harness support" and ships no cap. In-session kinds (`judge`, `lookup`, `chore`) get no cap (exo decided).
10. Cap value: twice the largest output-token count of any passing build cell in Task 1's sweep, so thinking is never cut on work that passed (exo decided).
11. Off-peak, options: (a) warn on stderr at start with the next off-peak time; (b) refuse at peak unless forced; (c) an `--offpeak` flag that waits. Pick (a): it never blocks or adds wall, the user keeps control, and (c) would hold a process asleep for hours. Peak windows (01:00-04:00 and 06:00-10:00 UTC, Monday to Friday) live as one overridable default in run.json `defaults` (exo decided).
12. Cost figure: on provider `deepseek` the record `costUsd` is computed from usage counts at the DeepSeek list price (peak or off-peak by the run's start time) instead of Claude Code's `total_cost_usd`, which prices `deepseek-flash` at the Opus rate (exo decided).
14. The sweep starts a nested claude, which the build sandbox refuses, so the lead runs every measurement outside the run: before `exo:build` it runs `node benchmarks/sweep.mjs --set build --provider deepseek --effort <low|medium|high> --repeat 3`, the same for `--set flow` and for `--set fixer --keep-repo`, records in `.exo/deepseek-flash/sweep/`, stopping when the balance delta passes $5; after the last task lands it reruns `--set flow --repeat 3` on the base and on the branch for the before/after of Tasks 2, 3 and 6. Task 1 reads the saved records; with none it applies Decision 6 (exo decided).
15. Task 2 adds its line through the Agent hook, not the orchestrator body, because `agents/orchestrator.md` has 1 token of body headroom (exo decided).
13. One final task writes every CHANGELOG.md line and the speed-ledger lines of Tasks 2-6, so no two tasks share those files (exo decided).

## Non-goals
- No model change and no V4-Pro trial (`lib/model-kinds.json` `models`).
- No advisor or escalation path, tool-call repair or stale-output pruning (research ideas 7 and 8).
- No trim of `hooks/session-rules.md` or `hooks/dispatch-rules.md` (each under 0.5% of cost).

## Assumptions
- [code] The sweep takes `--set`, `--cells`, `--effort`, `--provider`, `--repeat` and `--keep-repo` (benchmarks/sweep.mjs).
- [code] The record `costUsd` comes from `result.total_cost_usd` (benchmarks/sweep.mjs:386).
- [code] `lib/check-citations.mjs` reads every page by `fetchText` and never opens `sources.jsonl` or `t-<id>.txt` (lib/check-citations.mjs:8-27).
- [code] SessionStart puts pointers and the settings line before the static rule files (hooks/session-start.mjs:60-66).
- [assume] The DeepSeek Anthropic endpoint reports hits as `cache_read_input_tokens` and misses as `input_tokens`.
- [assume] A DeepSeek API key with quota is in the run.json provider keys; otherwise Decision 6 applies.

## Acceptance
- The deepseek effort table matches the pick rule on the repeat-3 sweep, results in benchmarks/results (Task 1) and the ledger (Task 8).
- A flow cell on deepseek makes fewer Agent calls at the same score, before/after in a results file (Task 2).
- SessionStart output opens with the static rule text (Task 3).
- A run-plan child for a mechanical kind starts with the output cap, or the results file says the harness has no support (Task 4).
- `exo claude --provider deepseek` at a peak time prints the off-peak notice (Task 5).
- A sweep record on deepseek carries cache hit and miss tokens and a `costUsd` within 20% of the balance delta (Task 6).
- A Reddit quote saved by the source script verifies offline (Task 7).
- The whole check passes (Success criterion).

## Manual checks
- Start `exo claude --provider deepseek` between 06:00 and 10:00 UTC on a weekday; you see one line saying peak hours bill double and when off-peak starts.
- After the sweep, open the DeepSeek balance page; the spend matches the results file to the cent.

## Plan basis
Repository: .
Branch: deepseek-flash
Worktree setup: none
Land gate: npm run validate:static
Land: local
Commit: feat(deepseek): run exo on DeepSeek Flash cheaper and faster
Lint: none
Allow: `node benchmarks/speed-ledger.mjs --render`

## Success criterion
`npm run check`
Red: none (the check passes on the base; each task's Proof proves its own red)
Product run: none (a plugin; each task Proof runs the changed script)

Run it once, in the background, to `.exo/check-deepseek-flash.log`; a clean run ends `SUMMARY` with `FAIL=0 WARN=0 UNRUN=0`.

## Checkpoint
- Blocks first: Task 6, because it fixes the cost figure every later proof reads.
- Parallel: Tasks 5 and 6.
- Shared state: `CONTRIBUTING.md` (Tasks 6, 1, 4, 2, 3, 7 and 8, chained in that order); `lib/model-kinds.json` and `tests/model-kinds.test.mjs` (Tasks 1 and 4).
- Smallest safe split: one task per concern, CHANGELOG.md in Task 8 only.

## Tasks
### Task 1: feat(model-kinds): set the deepseek effort table from a repeat-3 Flash sweep
Depends on: 6 | Files: `lib/model-kinds.json`, `tests/model-kinds.test.mjs`, `verify/model-kinds.mjs`, `CONTRIBUTING.md`, `benchmarks/results/2026-11-09-deepseek-flash-effort.md` | Data: the deepseek `kindEfforts` map, one effort per kind, medium written as high, unswept kinds listed unmeasured in the results file | Evidence: benchmarks/results/2026-11-09-deepseek-flash-effort.md | Proof: node --test tests/model-kinds.test.mjs
### Task 2: perf(orchestrator): run a single-worker part inline on DeepSeek
Depends on: 4 | Files: `hooks/agent-effort.mjs`, `tests/agent-effort.test.mjs`, `CONTRIBUTING.md`, `benchmarks/results/2026-11-09-deepseek-spawns.md` | Data: one line the Agent hook adds, on provider deepseek only, to an orchestrator prompt with `Workers: 1`, Agent calls per flow cell before and after in the results file | Evidence: benchmarks/results/2026-11-09-deepseek-spawns.md | Proof: node --test tests/agent-effort.test.mjs
### Task 3: perf(session-start): put the static rule text before pointers and settings
Depends on: 2 | Files: `hooks/session-start.mjs`, `tests/session-start-source.test.mjs`, `verify/budgets.mjs`, `CONTRIBUTING.md` | Data: the SessionStart `parts` array, static files first and the dynamic line last | Proof: node --test tests/session-start-source.test.mjs
### Task 4: perf(run-plan): cap output tokens for mechanical kinds on DeepSeek
Depends on: 1 | Files: `lib/model-kinds.json`, `lib/model-kinds.mjs`, `skills/build/scripts/run-plan-provider.mjs`, `tests/model-kinds.test.mjs`, `verify/model-kinds.mjs`, `CONTRIBUTING.md`, `benchmarks/results/2026-11-09-deepseek-output-cap.md` | Data: an `outputCaps` map of kind to token count under provider deepseek, passed as `CLAUDE_CODE_MAX_OUTPUT_TOKENS` to run-plan children | Proof: node --test tests/model-kinds.test.mjs
### Task 5: feat(exo-claude): warn when a DeepSeek run starts in peak hours
Depends on: none | Files: `lib/deepseek-peak.mjs`, `skills/build/scripts/exo-claude.mjs`, `skills/build/scripts/run-plan-preflight.mjs`, `skills/build/scripts/run-config.mjs`, `tests/deepseek-peak.test.mjs`, `tests/exo-claude.test.mjs` | Data: a pure function from a UTC time and the run.json `defaults` peak windows to `{ peak, nextOffPeak }` | Proof: node --test tests/deepseek-peak.test.mjs tests/exo-claude.test.mjs
### Task 6: fix(benchmarks): price DeepSeek records from usage and log cache hit and miss tokens
Depends on: none | Files: `benchmarks/prices.mjs`, `benchmarks/pricing.mjs`, `benchmarks/sweep.mjs`, `benchmarks/cell-usage.mjs`, `skills/build/scripts/run-plan-finish.mjs`, `tests/benchmark-cell-usage.test.mjs`, `tests/benchmark-deepseek-cost.test.mjs`, `CONTRIBUTING.md` | Data: a `deepseek-flash` price row with off-peak and peak rates, and `cacheHitTokens` and `cacheMissTokens` on each record and the end-of-run line | Proof: node --test tests/benchmark-deepseek-cost.test.mjs tests/benchmark-cell-usage.test.mjs
### Task 7: fix(check-citations): verify Reddit quotes from the source script's saved pages
Depends on: 3 | Files: `lib/check-citations.mjs`, `tests/check-citations.test.mjs`, `CONTRIBUTING.md` | Data: a map from cited URL to saved page text, built from `sources.jsonl` and each `t-<id>.txt` beside the cites file, fetched only when absent | Proof: node --test tests/check-citations.test.mjs
### Task 8: docs(changelog): record the DeepSeek Flash changes and their ledger lines
Depends on: 1, 2, 3, 4, 5, 6, 7 | Files: `CHANGELOG.md`, `CONTRIBUTING.md`, `benchmarks/speed-ledger.jsonl`, `benchmarks/speed-ledger.md`, `tests/benchmark-baseline-pool.test.mjs` | Data: one `## Unreleased` line per change and one ledger line per measured task, Task 1's effort lines included | Proof: node benchmarks/speed-ledger.mjs --check
