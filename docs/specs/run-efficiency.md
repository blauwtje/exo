# Cheaper subagent and headless runs

## Goal
A headless exo run passes `--exclude-dynamic-system-prompt-sections` and a per-kind `--max-turns` to each session, takes a headless build session's report from its final reply instead of a separate file write, and reports each session's cache read share. plan-check warns on adjacent tiny tasks, `exo:run-unit` uses a 1-hour cache, and verify's Opus review gets a tighter turn cap.

## Decisions
- Source: `.exo/research/next-session/efficiency-proposal.md` in the main checkout, changes 2, 3, 5, 6, 8, 9 and 10. Closed by: user.
- Every change is built and switched on at once, with no switch that starts off. Closed by: user.
- No model or effort change anywhere: Opus stays on review, current efforts stay; proposal changes 1 and 7 are dropped. Closed by: user.
- Proposal change 4 (fix-diff-only second review) is dropped because it already ships. `skills/build/scripts/run-tail.mjs:159` already passes `scope: 'fix diff'`. `skills/verify/references/review-rules.md:30` already limits that scope to `git diff HEAD` plus untracked files, and `tests/run-tail.test.mjs:55` asserts it. Closed by: code.
- Proposal change 11 (why a headless start costs more than a subagent start) needs two paid `claude` calls, so it has no static Proof; it is a `## Manual checks` line, not a task. Closed by: user (decision 3).
- Expected gains: each one is unmeasured unless it cites a measured source; its adoption test sits under `## Acceptance` or `## Manual checks`. Closed by: user (decision 4).
- Change 2 scope: only headless `run-plan.mjs` build sessions stop writing `.exo/implementer-<n>.md` themselves. `run-plan.mjs` writes the reply text above the last line to that path, so `land-task.mjs:91`, `run-report.mjs:9`, `run-plan.mjs:308` and `agents/review-branch.md:20` keep reading the same file. The subagent route (`skills/build/implementer-prompt.md`, `agents/run-unit.md`) keeps its file, because `Return: one line` keeps the report out of the dispatcher's context. Closed by: user.
- New defaults (the turn-1 cache write warning bar and the tiny-task size bar) each get one overridable key in `lib/run-providers.json` `defaults` or a plan-check constant, per `CLAUDE.md` "New value". Closed by: spec.
- Change 2, plan sessions: covers single-task build sessions only. A `Plan session` reply over up to `INLINE_TASK_LIMIT` (4) tasks keeps writing `implementer-<n>.md` files itself. Closed by: user.
- Proposal change 5 (lower `agents/review-branch.md` `maxTurns`) is dropped. `maxTurns` only stops a session; turns are billed as used, so a lower cap saves nothing on a normal review. Subagent reviews take 18 turns at the median (`subagent-vs-headless-measured.md`), so a cap of 10 or 20 would cut many off before the findings file. `maxTurns` stays 30. Closed by: user (delegated to lead).
- Change 6 bar: a task is tiny when (task + `Files:` bytes) / 4 is under 2,000, one plan-check constant, under a third of the `checkSize` limit of 6,250, so two merged tiny tasks still pass `checkSize`. The warning fires only for two adjacent tiny tasks that share a `Files:` path and a `Depends on:` chain: `sessionMode` already batches tasks without shared files, and `checkSharedFiles` already flags shared files without a chain. Closed by: user (delegated to lead).
- Change 9 plan-session cap: 60 turns per task, so a session of n tasks gets `--max-turns` 60 × n. Turns are billed as used, so a higher cap costs nothing on a normal session, while one 60 cap for 4 tasks would cut good work off. Closed by: user (delegated to lead).
- Change 9 cap hit: the task is treated as blocked, its partial work goes to a hint file such as `.exo/carry/task<n>-partial.patch` and the run tree is reset, per the blocked-task rule in `CLAUDE.md`; no automatic retry, because a session that hits the cap is usually looping, and a retry would repeat the cost. Closed by: user (delegated to lead).
- Change 10 bar: the warning fires when turn-1 `cache_creation_input_tokens` exceeds 20,000, about twice the measured 9k normal headless turn 1 (`efficiency-proposal.md` change 6), as one overridable key in `lib/run-providers.json` `defaults`. Closed by: user (delegated to lead).
- Change 8 kept: `exo:fetch-docs` confirmed the key on https://code.claude.com/docs/en/sub-agents: "`experimental` | No | Map of experimental options. Set its `cacheTtl` key to `5m` or `1h`... Requires Claude Code v2.1.248 or later". The plugins reference lists no agent frontmatter keys, so Task 10 adds `experimental` to `SUPPORTED_KEYS` with that URL as its source. Closed by: user (delegated to lead).
- `--max-turns` exists for print mode: https://code.claude.com/docs/en/cli-reference says "Limit the number of agentic turns (print mode only). Exits with an error when the limit is reached. No limit by default." Closed by: `exo:fetch-docs`.
- `CHANGELOG.md`: written only by the final task. Closed by: user (repo rule).

## Non-goals
- Model, effort or provider changes in `lib/run-providers.json`, `agents/*.md` or `skills/build/scripts/run-plan.mjs`.
- The subagent dispatch template `skills/build/implementer-prompt.md` and its `Report to:` line.
- `--bare`, `--setting-sources`, `--system-prompt-file` or tool-search changes for headless sessions (proposal "Rejected claims").

## Open points

## Assumptions
- `claudeArgs` (`skills/build/scripts/run-session.mjs:251`) builds the argv for every headless session, review and fix included, through `spawnOne` in `skills/build/scripts/run-plan.mjs:289`; `run-tail.mjs` spawns through the `runSession` it is handed. code.
- `parseStream` (`skills/build/scripts/run-session.mjs`) already reads `usage.cache_read_input_tokens` and `usage.cache_creation_input_tokens` per assistant event and the final `result` text as `resultText`. code.
- `run-unit` (maxTurns 90) runs only as a subagent and gets no headless cap. assume.
- Task 4: an empty or single-line reply writes an empty report, which then fails land-task's report check without crashing. assume.
- Task 5 changes only the `Build session` prompt; the `Plan session` `report` field (`skills/build/scripts/run-prompts.mjs:63`) waits on the plan-session open point. assume.
- Tasks 6-8: a provider whose events lack `usage` cache fields gets no share and no warning. assume.
- Task 2 passes `--max-turns` for every provider, the same way `claudeArgs` already passes `--tools`. assume.
- `SESSION_TOOLS` kinds `build`, `fix` and `review` map to the agents `build-task` (maxTurns 60), `fix-review` (40) and `review-branch` (30). code.

## Acceptance
- Task 1: `claudeArgs` output holds `--exclude-dynamic-system-prompt-sections`; seam: `tests/run-session-args.test.mjs`. Gain unmeasured: the proposal's probe saw 4.7k of 11.6k first-turn tokens read from cache in one unpaired call, and anthropics/claude-code#74318 measured -7.6% in a different setup.
- Task 2: `claudeArgs` holds `--max-turns 60` per task for kind `build` (60 × n for a plan session of n tasks), 40 for `fix` and 30 for `review`, each read from the agent's frontmatter; seam: `tests/run-session-args.test.mjs`. No saving is claimed; adoption test: grep kept `iter-*-task-*.log` result events for `num_turns` above 60.
- Tasks 3-5: a headless build session's prompt names no `Report to:` file (Task 5), and `run-plan.mjs` writes the reply text above the last line to `.exo/implementer-<n>.md` before landing (Task 4); seams: `tests/run-plan-red-repair.test.mjs`, `tests/stall-guard.test.mjs`. Gain unmeasured: `benchmarks/results/2026-10-12-flow-run-4b.md:45` counts 6 of about 9 extra tool calls as report writes. Adoption test: rerun the 4b flow sweep (`flow-base` vs `flow-run`, n=4, `--concurrency 1`, under `caffeinate -i`) and adopt if weighted tokens fall and the hidden check stays 4/4.
- Tasks 6-8: each session's ledger line and the run report show its cache read share, and a warning appears when its turn-1 cache write passes the bar; seams: `tests/run-report.test.mjs`, `tests/run-plan-hook-refusals.test.mjs`. Adoption test: compute the share for the kept `cache-ab` runs and check that it flags the 5m post-wait rewrite in `cache-ttl-ab.md` test 3.
- Task 9: plan-check warns on adjacent tiny tasks; seam: `tests/plan-check-tiny-tasks.test.mjs`. Gain unmeasured; adoption test: one plan with 4 one-file tasks against the same plan merged into 2 tasks, comparing cost, wall time and retries.
- Task 10: `agents/run-unit.md` carries the 1-hour cache key; seam: `tests/agents.test.mjs`. Gain unmeasured; #74318 measured +8.6% for 1h on every subagent. Adoption test: one plan through `exo:build` with run-unit at 1h and at 5m, comparing run-unit's cache write tokens.
- Tasks 11-12: a headless session that ends on its `--max-turns` cap leaves its task blocked, its partial diff in `.exo/carry/task<n>-partial.patch`, the run tree reset, and no repair or retry session; seam: `tests/run-plan-max-turns.test.mjs`. No saving is claimed.
- The Success criterion passes on the branch rebased onto `origin/main`.

## Manual checks
- Change 3 adoption: two runs of `docs/specs/builder-self-check.md` as in `cache-ab-*.md`, with and without the flag, comparing turn-1 `cache_creation`, `cache_read` and total cost; needs the user's account.
- Change 11 measurement: one headless call with the exo task flag set and one `exo:build-task` subagent call, same tiny prompt and model, comparing turn-1 `cache_creation` and system prompt size from the transcript; needs the user's account.

## Plan basis
Repository: /Users/thomash/Documents/Code/personal/plugins/exo/.worktrees/run-efficiency
Branch: run-efficiency
Worktree setup: none
Land gate: npm run validate:static
Land: push-main
Lint: none
Allow: none

## Success criterion
`npm run check` passes.

## Checkpoint
- Blocks first: Task 1.
- Parallel: Tasks 1, 9 and 10.
- Shared state: `skills/build/scripts/run-session.mjs` and `tests/run-session-args.test.mjs` (Tasks 1, 2, 6 and 11); `skills/build/scripts/run-plan.mjs` (Tasks 4, 8 and 12); `tests/run-plan-red-repair.test.mjs` (Tasks 4 and 12); `CHANGELOG.md` (Task 13).
- Smallest safe split: one task per proposal change, split further where `skills/build/scripts/run-plan.mjs` or plan-check with its tests passes the size bar; tasks on a shared file chained by Depends on.

## Tasks
### Task 1: perf(build): drop dynamic system prompt sections from headless sessions
Depends on: none | Files: `skills/build/scripts/run-session.mjs`, `tests/run-session-args.test.mjs` | Data: one constant flag `--exclude-dynamic-system-prompt-sections` in the `claudeArgs` argv | Proof: node --test tests/run-session-args.test.mjs
### Task 2: feat(build): cap each headless session at its agent's maxTurns
Depends on: 1 | Files: `skills/build/scripts/run-session.mjs`, `tests/run-session-args.test.mjs`, `tests/run-plan-start.test.mjs`, `tests/run-plan-plan-session.test.mjs` | Data: a `SESSION_TOOLS`-style map from session kind to agent file, its `maxTurns` read from frontmatter into `--max-turns`, multiplied by the task count for a plan session | Proof: node --test tests/run-session-args.test.mjs
### Task 3: test(build): carry each stub build report in the stub's final reply too
Depends on: none | Files: `tests/run-plan-proof.test.mjs` | Data: each task-mode stub that writes `.exo/implementer-<n>.md` also ends its reply with that report text above its last line, so the tests pass before and after Task 4 | Proof: node --test tests/run-plan-proof.test.mjs | Red: none (test-only edit, passes before and after Task 4)
### Task 4: perf(build): write a headless build session's report from its final reply
Depends on: 3 | Files: `skills/build/scripts/run-plan.mjs`, `tests/run-plan-red-repair.test.mjs` | Data: for a single-task `Build session`, the reply text above its last line, written by `run-plan.mjs` to `.exo/implementer-<n>.md` before landing | Proof: node --test tests/run-plan-red-repair.test.mjs
### Task 5: perf(build): stop asking a headless build session for a report file
Depends on: 4 | Files: `skills/build/run-task-prompt.md`, `skills/build/scripts/run-prompts.mjs`, `tests/stall-guard.test.mjs` | Data: the `Build session` prompt drops `Report to:` and its write-the-report rules and asks for the report as the reply text above the last line | Proof: node --test tests/stall-guard.test.mjs
### Task 6: feat(build): read each session's cache read, write and turn-1 write
Depends on: 2 | Files: `skills/build/scripts/run-session.mjs`, `tests/run-session-args.test.mjs` | Data: `parseStream` returns summed `cache_read_input_tokens`, summed `cache_creation_input_tokens` and the first assistant event's `cache_creation_input_tokens`, none when `usage` lacks them | Proof: node --test tests/run-session-args.test.mjs
### Task 7: feat(build): format a session's cache read share and turn-1 write warning
Depends on: none | Files: `skills/build/scripts/run-report.mjs`, `lib/run-providers.json`, `tests/run-report.test.mjs` | Data: the cache read share text, a warning line when turn-1 write exceeds the bar, the bar 20000 as one `defaults` key | Proof: node --test tests/run-report.test.mjs
### Task 8: feat(build): report each session's cache read share and warn on a large turn-1 write
Depends on: 4, 6, 7 | Files: `skills/build/scripts/run-plan.mjs`, `tests/run-plan-hook-refusals.test.mjs`, `tests/run-plan-session.test.mjs` | Data: the Task 6 fields added to each `sessions.jsonl` ledger line and run record, the Task 7 share and warning in the run report, the bar read from run config `defaults` | Proof: node --test tests/run-plan-hook-refusals.test.mjs
### Task 9: feat(spec): warn on adjacent tiny plan tasks in plan-check
Depends on: none | Files: `skills/spec/scripts/plan-check.mjs`, `tests/plan-check-read-cost.test.mjs`, `tests/plan-check-tiny-tasks.test.mjs` | Data: one size-bar constant and a warning per adjacent pair under it | Proof: node --test tests/plan-check-tiny-tasks.test.mjs tests/plan-check-read-cost.test.mjs
### Task 10: perf(agents): give run-unit a 1-hour prompt cache
Depends on: none | Files: `agents/run-unit.md`, `tests/agents.test.mjs` | Data: the cache TTL frontmatter key on `run-unit` only, added to `SUPPORTED_KEYS` | Proof: node --test tests/agents.test.mjs
### Task 11: feat(build): read a session's result subtype and let the run stub emit one
Depends on: 6 | Files: `skills/build/scripts/run-session.mjs`, `tests/run-session-args.test.mjs`, `tests/run-plan-fixture.mjs` | Data: `parseStream` returns the `result` event `subtype` such as `error_max_turns`; a fixture step's optional `subtype` replaces `success` in the stub's result event | Proof: node --test tests/run-session-args.test.mjs
### Task 12: feat(build): stop a task that hits its turn cap as blocked
Depends on: 8, 11 | Files: `skills/build/scripts/run-plan.mjs`, `tests/run-plan-red-repair.test.mjs`, `tests/run-plan-max-turns.test.mjs` | Data: on subtype `error_max_turns`, `run-plan.mjs` calls `shelveLeftover` with `.exo/carry/task<n>-partial.patch` (diff against HEAD plus untracked files, tree reset) and `blockedStop` with reason `hit --max-turns <cap>`, skipping `repairTask` | Proof: node --test tests/run-plan-max-turns.test.mjs tests/run-plan-red-repair.test.mjs
### Task 13: docs(changelog): note the cheaper run changes
Depends on: 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12 | Files: `CHANGELOG.md` | Data: one `## Unreleased` line per change under `### Changed` or `### Added`, no version raised | Proof: grep -c -e "exclude-dynamic-system-prompt-sections" -e "max-turns" -e "cache read share" -e "run-unit" -e "turn cap" CHANGELOG.md
