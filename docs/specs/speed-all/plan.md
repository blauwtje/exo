## Goal
exo spends fewer seconds and dollars per build and per Bash call with equal or better quality.

## Verdict
Verdict: go
Objection: in change A the build fork's own `npm test` after the unit may be the only test run on the merged tree (land-slot runs each task's Land gate in its own slot), so dropping it can let an integration failure through; the replacement must query lib/check-cache.mjs for the merged tree and run the suite once on a miss.

## Decisions
1. A, result chain: `skills/build/scripts/land-slot.mjs` and `land-task.mjs` print one final verdict block (landed task ids, each Proof line, the check-cache key and status of the merged tree). `agents/task-runner.md` returns that block verbatim and runs no test after landing. The build fork (`skills/build/SKILL.md`, `references/run-loop.md`, `references/tail.md`) uses the block plus `node lib/check-cache.mjs --query` instead of its own npm test, git log and a second read of a build reference, and on a miss runs the suite once. Setup turns of the fork that a script can do are cut (profile R1: orch_setup 16.0 s, thinking and the runner prompt). Body text only: no agent frontmatter change.
2. B: the over-byte-limit step of `hooks/dispatch-bash.mjs` returns allow plus updatedInput `bash <saved .exo/long-command-N.sh>` instead of deny, always saves the copy (also for the variant that saved none, R3 row 2), and `firstRewrite` accepts it. additionalContext tells the model the rewrite in one short line.
3. D: lower the dispatch-bash per-call ms by lazy-loading modules the common path does not need; measure with `benchmarks/hook-timing.mjs` before and after; drop D if under 20%.
4. Each change gets a `benchmarks/speed-ledger.jsonl` entry (rendered to `speed-ledger.md`) with baseline and threshold added by the lead before the build, outside the plan. A: orch_post + tr_post mean at least 10 s below 38.3 s, flow-unit mean wall at most 138.4 s and median at most 130 s, mean cost at most $0.442, hidden 15/15, share of cells with a review or gate tail not lower than 5/15. B: 0 byte-limit denies when replaying the recorded over-limit commands from the R3 corpus, hook-timing per-call ms not higher. D: per-call ms at least 20% lower, all hook tests green.
5. After the build the lead runs the candidate flow-unit arm from the branch worktree (paid, about $7, long-running, started in the background), writes `benchmarks/results/2026-11-09-speed-all.md`, fills the ledger verdicts and adds the changelog lines, outside the plan.
6. Constraints: `lib/model-kinds.json`, `hooks/agent-effort.mjs` and all agent frontmatter stay unchanged; main -> exo:orchestrator -> subagents stays; `agents/review-branch.md` and `skills/gate/scripts/pick-reviewer.mjs` stay unchanged. No code comments.
7. Karpathy principles (docs/principles/prompt.md:17-20, eval.md:14-18): every open choice is settled here, none is left to the builder; each task writes the least code that makes its Proof pass, with no new helper, flag or abstraction it does not need; each task touches only its Files lines, with no drive-by refactor, rename or reformat; each Proof is seen red before the edit and green after. Eval: the flow-unit arm judges change A alone (B and D do not touch the build path and are judged by their own replay and hook-timing figures); a timed-out or aborted cell counts as a failure; transcripts of the slowest and the failing cells are read before a wall or cost change is trusted; at equal score keep the simpler code.

## Non-goals
- A 1h cache TTL on the orchestrator: net -$4.6 per 14 days (`agents/orchestrator.md`).
- Hook text trimming: under $10 per 14 days (`hooks/`).
- Build-task rule docs in the brief: ledger build-task-rule-docs-as-stable-prefix rejected, reads already in one parallel turn (`agents/build-task.md`).
- Rewrites of stash, find and Reads: they change meaning (`hooks/dispatch-bash.mjs`).

## Acceptance
- The final verdict block and its tests: Task 3. The fork's use of it with one suite run on a miss: Task 4.
- Over-limit commands are rewritten, not denied: Task 1. Per-call ms: Task 2.
- Ledger entries are added by the lead before the build; the arm, results page, verdicts and changelog come after it, then the Success criterion.

## Plan basis
Repository: /Users/thomash/Documents/Code/personal/plugins/exo
Branch: spec/speed-all
Worktree setup: per repo (worktree under .worktrees/speed-all)
Land gate: npm run validate:static
Land: local
Commit: perf(speed): cut build-fork turns and the over-limit Bash deny, and lower dispatch-bash per-call ms
Lint: none
Allow: none

## Success criterion
`npm run check`
It ends with FAIL=0 WARN=0 UNRUN=0.
Red: none (each task's Proof proves its own red)
Product run: none (the plugin has no bin or start script)

## Checkpoint
- Blocks first: none.
- Parallel: Tasks 1 and 3.
- Shared state: `hooks/dispatch-bash.mjs` (Tasks 1 and 2).
- Smallest safe split: one task per change A, B and D; the lead adds the ledger entries first and runs the arm, results and changelog last.

## Tasks
### Task 1: perf(hooks): rewrite an over-limit Bash command to a saved script instead of denying it
Depends on: none | Files: `hooks/dispatch-bash.mjs`, `tests/dispatch-bash-long-rewrite.test.mjs`, `tests/dispatch-bash-alternatives.test.mjs`, `tests/dispatch-bash-ss-b.test.mjs`, `tests/dispatch-bash-ss-c.test.mjs`, `tests/dispatch-bash-ss-warn.test.mjs`, `tests/hooks.test.mjs`, `verify/budgets.mjs`, `CONTRIBUTING.md`, `lib/guard-rules.mjs`, `tests/guard-rules.test.mjs` | Data: an allow output with updatedInput `bash <saved path>` and a one-line additionalContext; each open choice settled in Decisions, least code, Files lines only, Proof red then green | Proof: node --test tests/dispatch-bash-long-rewrite.test.mjs
### Task 2: perf(hooks): lazy-load the modules the common dispatch-bash path does not need
Depends on: 1 | Files: `hooks/dispatch-bash.mjs`, `tests/hook-timing.test.mjs`, `tests/dispatch-bash-alternatives.test.mjs`, `tests/dispatch-bash-ss-b.test.mjs`, `tests/dispatch-bash-ss-c.test.mjs`, `tests/dispatch-bash-ss-warn.test.mjs`, `tests/hooks.test.mjs`, `verify/budgets.mjs`, `CONTRIBUTING.md` | Data: dynamic imports inside the steps that need them; each open choice settled in Decisions, least code, Files lines only, Proof red then green | Proof: node --test tests/hooks.test.mjs tests/hook-timing.test.mjs
### Task 3: perf(build): print one final verdict block from land-slot and land-task
Depends on: none | Files: `skills/build/scripts/land-slot.mjs`, `skills/build/scripts/land-task.mjs`, `tests/land-slot.test.mjs`, `tests/land-task-output.test.mjs`, `tests/land-task-commit.test.mjs`, `tests/land-task-land-gate.test.mjs`, `tests/land-task-retry.test.mjs`, `tests/land-task-services.test.mjs`, `tests/land-task-stdin-report.test.mjs` | Data: a text block with landed task ids, Proof lines and the check-cache key and status; each open choice settled in Decisions, least code, Files lines only, Proof red then green | Proof: node --test tests/land-slot.test.mjs tests/land-task-output.test.mjs tests/land-task-commit.test.mjs tests/land-task-land-gate.test.mjs tests/land-task-retry.test.mjs tests/land-task-services.test.mjs tests/land-task-stdin-report.test.mjs
### Task 4: perf(build): let the build fork use the verdict block and one check-cache query
Depends on: 2, 3 | Files: `agents/task-runner.md`, `skills/build/SKILL.md`, `skills/build/references/run-loop.md`, `skills/build/references/tail.md`, `tests/build-text.test.mjs`, `lib/model-kinds.json`, `verify/checks/reference-tables.mjs`, `CONTRIBUTING.md`, `tests/benchmark-flow-unit.test.mjs`, `tests/model-kinds.test.mjs`, `verify/model-kinds.mjs`, `tests/implementing-push-gate.test.mjs` | Data: body text only, no frontmatter change; lib/model-kinds.json and all agent frontmatter stay byte-identical; each open choice settled in Decisions, least code, Files lines only, Proof red then green | Evidence: none (speed change judged by the ledger arm, not a wording eval) | Proof: node --test tests/build-text.test.mjs
