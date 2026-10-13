# Changelog

Versions follow [Semantic Versioning](https://semver.org/spec/v2.0.0.html). A
skill's trigger, a skill or agent name, and the `exo:` namespace are the public
surface: renaming or removing one is a breaking change, adding one is a minor
release, and a body rewrite that keeps the trigger is a patch.

Versions before 0.125.0 are in [CHANGELOG-archive.md](CHANGELOG-archive.md).

## Unreleased

### Fixed

- The run watcher finds the main checkout from a worktree whose `.git` file holds a relative path (`worktree.useRelativePaths`) or backslashes.
- Tests no longer fail at random with `ENOTEMPTY`: every test process runs git with `maintenance.auto=false`, so a background repack no longer races the cleanup of a temporary repository.
- The test that the gate overlaps a slow Proof no longer fails under load: it checks start markers instead of wall time.

## 0.132.0 - 2026-10-13

### Highlights

- **The `budget` setting now defaults to `off`, so every helper runs on the session's model; `fast`, `balanced` and `quality` replace `low`, `medium` and `high`.**
- **A plan now builds through the detached loop by default, its proofs run outside the sandbox, one review covers the branch, and small or clear work reaches build without questions. A detached run is now watched: its progress shows under the prompt, and a blocked task wakes the lead to repair and resume it.**
- **`exo run` now builds a small plan in one session and lands it by script: in the flow benchmark it uses 1.23x the no-plugin baseline's tokens with the hidden check 4/4, against 1.76x for the `build` flow.**
- **A plan task's Proof and a plan's Success must now fail before the change: on the test-pollution benchmark `exo run` with this red-green gate passed 5 of 5, against 1 of 35 for the no-plugin baseline.**

### Added

- `save-session` ends each handoff with a `Resume:` line and `## Then` steps, and the session hook shows them.
- `exo wait <id>` blocks until a detached run ends, then prints its phase and report path; its deadline is `EXO_WAIT_MS` (default 6 h), and the `--detach` start line prints it as the watch command.
- A detached `exo run` writes one followable live log at `.exo/run/live.log` and shows task progress in a status line under the prompt; when a run stops, a watcher hook wakes the lead to repair and resume it.
- `exo run` orchestrates a plan by script: a small plan with no shared step or design task runs as one plan session whose tasks the script lands, any other plan task by task, each session from one generated task brief with lean flags and the run's plugin; a plan session that stops short has its leftover saved as a patch in the run's log folder and the tree cleaned before the per-task fallback; `--session auto|task|plan` picks the mode, `--max-run-usd` caps the run from a per-run session ledger, a scripted tail reviews, fixes and verifies the branch, and `land-task` under a run pin prints at most 20 lines.
- The flow benchmark gains a `flow-run` arm that measures `exo run` with confined child sessions and ranks it against `flow-base` (`benchmarks/results/2026-10-12-flow-run-4b.md`); the per-task `flow-run-task` arm was dropped at 2.7x.
- `land-task` refuses a task whose Proof passes on the run's base with the task's tests overlaid, so each Proof proves red before green; a task that cannot fail first states `Red: none (<reason>)`, a flaky Proof `Repeat: <2-5> (<reason>)`, and the task's land record keeps the Red outcome.
- `exo run` refuses a plan whose Success passes on the run's start commit and writes the red-green gate line to `run.log`.
- `plan-check` flags a malformed `Red:` or `Repeat:` line and a Success that cannot fail.
- The value benchmark gains an `exo-run` arm that runs a task through `exo run`, and a spend cap that stops a run before a cell would pass it (`benchmarks/results/2026-10-12-test-pollution-red-green.md`).
- `lib/code-comments.mjs` finds comment and suppression lines in added code across common languages, and `lib/code-rules.mjs` adds ESLint checks for nesting depth 2, 3 parameters, nested ternaries and `else` after `return`, with function length over 20 lines as a warning.
- A PreToolUse `Edit|Write|MultiEdit` hook denies an edit that adds a comment line; `guards` off turns it off.
- The flow benchmark counts comment lines added, hook denials and the hidden check per cell (`benchmarks/results/2026-10-12-no-comments.md`).
- `strip-comments.mjs` lists and removes disallowed code comments and prints the comment percentage; a script's usage header becomes its `--help` text.
- `npm run check` fails on any disallowed comment in `skills/`, `lib/` and `hooks/`.
- Each release keeps the newest 10 versions in `CHANGELOG.md` and moves the rest to `CHANGELOG-archive.md`.
- `plan-check` refuses a task whose Proof or the `Allow:` list starts a nested claude, because `exo run`'s sandbox cannot; the measurement moves to the Success line.
- A run that ends `landed`, `passed` or `refused` moves itself to `.exo/kept/<id>/`, so `.exo/run/` holds only live runs.
- After `spec` starts a detached `exo run`, the session watches it and reports its end unprompted: phase, landed range, push target and the next step.
- A plan's Plan basis may name `App:`, a start command and a ready URL; `exo run` starts it once before the first proof or the Success gate and stops its process tree when the run ends, and `plan-check` flags an `App:` with no ready URL.
- `npm run validate:static` fails a test file over 40 kB.
- `plan-check` flags a task that changes a source file with an existing `tests/<base>.test.mjs` or `tests/<base>-*.test.mjs` but lists none of them; one listed test is enough.
- When a task's Proof shows no red, `land-task` names the untagged base commits that already touch the task's files.

### Changed

- The `budget` setting values are now `off`, `fast`, `balanced` and `quality`; a stored `low`, `medium`, `high`, `lean`, `normal` or `full` still reads as its new name, and the model table columns carry the new names.
- The `budget` setting now defaults to `off` (was `medium`): exo sets no model or effort, so every agent runs on the session's model.
- `spec` asks the brief for a `Non-goals` section.
- `spec`'s architecture sketch names the throwaway script that answers a question.
- `code-standard` tells the writer to match the surrounding file and bans test-fitted code.
- `context` suggests a fresh session when the next request is unrelated.
- `ship` links the intent from the PR's Why section.
- A parallel plan's first wave holds only its first task until one task has landed, so a bad first task stops the run before the rest start.
- A detached `exo run` builds `Design:` tasks unattended: it picks the recommended direction itself, records it with `run-decision.mjs`, and writes a design contract only when the plan froze one.
- `exo run` opens only the package registries of the ecosystems the repo or plan uses, plus the registries named in its `.npmrc`, `.yarnrc.yml`, `nuget.config` and `pip.conf`, and sets the dotnet variables only for .NET projects, under the user's own values.
- The stall limit is set by `EXO_STALL_MS` (default 60 s) and the run prompts name the same limit; the stall hook caps timeouts at `BASH_MAX_TIMEOUT_MS`.
- `run-state.mjs` holds the one exit-code-to-phase map for `exo run` and `exo-cli`, so exit 2 reads `refused` everywhere.
- Lines in the run's live log now start with `[HH:MM:SS]` and read as plain text: task start, landed lines with duration, turns, tokens and cost, and the stop reason.
- `build` on a plan starts the detached loop (`exo-cli.mjs run <plan> --detach`); the in-session unit route stays only for `--task` mode, a codex host, or no `claude` on `PATH`.
- `exo run` runs each task's `Proof:` and `Land gate:` from its own process, outside the build session's sandbox and without a subagent.
- `spec` asks no question for small or clear work and records each choice under `## Decisions` as closed by exo.
- `verify` emits one `REVIEW Branch` line and `run-tail` runs one fresh review of the whole branch, flagging only correctness and requirement gaps; `run-unit` dispatches no per-task review.
- `ship` asks no landing question when the plan's `Land:` names a mode.
- `run-plan.mjs` is split into `run-session.mjs`, `run-worktree.mjs`, `run-prompts.mjs` and `run-report.mjs`, halving it to 29 kB so a plan task that edits it fits one session; behavior is unchanged.
- The code standard is rewritten to four principles and bans comments except the allowed list.
- `land-task` refuses a task whose added code breaks the code rules, and verify sends each such line to the review fixer as a `fix` finding.
- Versions before 0.124.4 moved to `CHANGELOG-archive.md`.
- This repo builds plans through `exo run --detach`, and each plan ends with a task that writes its `## Unreleased` line.
- The `verify` skill body moves situational loop text into its references, so it fits its 2700-byte budget again.
- `verify` and the red check share one test-path rule, `isTestPath` in `lib/red-green.mjs`; a `-test.` suffix no longer counts as a test file.
- A builder flattens a too-deep block it touches.
- Comments in `skills/`, `lib/` and `hooks/` are removed, from 14.6% of lines to 0.0% disallowed; a comment on behavior forced by a library, browser, platform or protocol returns as a `// why:` line.
- Every exo question keeps its options in a fixed A, B, C order; the recommendation is marked where it stands and never moves an option to the top.
- A run's per-task reviews run up to three at a time instead of one after another.
- The land-task, ui-design-scripts, run-plan and verify-gate tests are split into themed files under 20 kB.
- `review-rules` and the verify pressure benchmark describe the one branch review and its single `.exo/review-branch.md` record.
- The `budget` setting gains `off`: under `off` no exo dispatch sets a model or effort, so every agent inherits the session.
- Under `low`, `medium` and `high` one hook sets each dispatch's model and effort from the budget's column of the per-kind table in `model-kinds.json`; agents and skills carry no `model:` or `effort:` line.
- A detached `exo run` passes the budget's model and effort to its sessions, and none under `off`.
- The Codex agents are generated from the medium column, one agent per role.
- `CLAUDE.md` gains the AI-engineering principles, merged to stay within 60 lines.

### Removed

- The per-budget agent twins and the `budgets`, `skills` and `codexTwins` parts of the kind table.

### Fixed

- The run watcher hook loads again (it took its arguments in the wrong order and `claude plugin validate` refused it), shows a run that was already running when the session started, and finds the run from a worktree session.
- The release workflow's `npm run check` passes again on a runner with no git identity: the test harness gives every spawned script a stub author and committer.
- A detached run under budget `off` no longer sets `CLAUDE_CODE_EFFORT_LEVEL` to the string `null` in its child sessions.
- A refused, stopped or crashed run's `report.md` names its `Reason:`, and a refused detached run no longer falls back to building in the session.
- A lead over its context limit may still use ToolSearch, SendMessage, TaskStop, Monitor and a one-line append, and the deny text tells it to wait on and relay its background work.
- A dotnet command no longer hangs the run session (#120): registry domains are allowed in the run sandbox.
- A command that prints nothing for too long is stopped by the stall guard within seconds and reported, instead of being waited out for minutes.
- The app named in a plan's `App:` line is started before each task and plan session, not only before the first proof, so a dead app no longer stalls the run.
- `exo run` lands once its review fix lands with a clean fix review; before, the stale `fix=1` of the branch review parked it on `land anyway`.
- A task's Proof and its red-green base run no longer see `EXO_RUN`, `EXO_RUN_DIR`, `EXO_RUN_TASK` or `EXO_DROPS`, so a Proof like `node --test <file>` inside `exo run` no longer fails or parks gates on the live run.
- `exo run` now matches an unsandboxed exo script with its arguments, so `land-task` and `verify.mjs` run outside the sandbox with any flags.
- A test run inside `exo run` no longer parks its guard refusals as open gates in the live run, nor fails tests that branch on the run: `npm test` and `npm run check` strip `EXO_RUN`, `EXO_RUN_DIR`, `EXO_RUN_TASK` and `EXO_DROPS` first.
- A timeout or kill of `exo run` now also stops its claude session, which runs in its own process group, and a run whose log folder was removed no longer crashes; a benchmark cell time-out likewise ends the cell's whole process tree before its folder goes.
- The red-green gate kills the whole proof tree on timeout, accepts a top-level overlay path, reports a worktree it left behind, skips when no passing Bash proof or run start commit exists, and records the Red outcome of an MCP-deferred task; the benchmark spend cap rejects a bad value and counts an unpriced cell, and `exo-run` usage survives a truncated last session line.
- `exo run` no longer stops with `Landing the review fix failed: no changed path to commit` when the review fixer changes nothing; it goes on to the final gate.
- The Success gate of `exo run` drops an unreachable stall stop.
- The code rules judge code structure only on lines whose code changed.
- A directory named `spec` no longer marks test code, so a task that changes `skills/spec/` gets a real red check.
- `report.md` of an `exo run` keeps the refused commands after the worktree is removed: the run directory stores them and the report lists every command the permission rules refused.
- A guard test run inside an exo build no longer parks that run on its sample commands.
- Plan-check estimates a task's read cost at 2 bytes per token, so it flags tasks too big for one session.
- A run's task session over the context limit writes a hand-off in its worktree, and the run continues the task in a fresh session instead of stopping.
- The run report lists hook refusals apart from permission denials, and advises `Allow:` only for real denials.
- Tests that start run scripts drop the run variables under bare `node --test`, so they never write a live run's state.
- `land-task` lands a task that moved a listed file with `git mv`.
- A plan `Files:` entry with a line range, such as `knip.config.ts:22-29`, reads as its path.
- `exo run` saves a stopped task's leftover edits to `task-<n>-leftover.patch` in the run's log folder and resets the tree, so the next task starts clean.
- `exo run` lands a blocked task whose Proof the sandbox or permission rules refused when the script's own proof and gate pass.
- A plan's `App:` start command may contain ` | `; only the first ` | Ready: ` splits it.
- A task session reports a sandbox-refused proof as `not run`, so `land-task` runs the proof instead of refusing the report.
- The `.csproj` run test commits `App.csproj` on `main` and asserts `gate PASS`; on the run branch the stray-path check failed its gate.

## 0.131.1 - 2026-10-11

### Fixed

- Inside an `exo run`, a task session that ends on `Task <n>: LANDED <sha>` is no longer blocked twice, a session that ends on a question followed by answer options (A/B) is now blocked, and a run that lands itself no longer tells the user to push or open a pull request.

## 0.131.0 - 2026-10-11

### Added

- An `exo run` lands itself per the plan's one approved `Land:` line (`local`, `push-main` or `pr`): after a green verify it rebases, rechecks, lands and cleans up; a review with fixes left, a conflict, a failed push or a guarded command in a run (force push, reset, publish, release, tag push, deploy) parks the run with a gate in `.exo/run/<id>/gates.md` instead, and `exo approve <id>` resumes it; spec plans now carry the `Land:` line.

## 0.130.0 - 2026-10-11

### Added

- Inside an `exo run`, a session never waits on the human: a hook denies `AskUserQuestion` and blocks an end without a status line, telling the session to decide from the spec and settings and log the choice in `.exo/run/<id>/decisions.md`; after two blocks the task ends BLOCKED, workspace, codex and ship choices fill themselves, and the run report lists the decisions.

## 0.129.0 - 2026-10-11

### Added

- After approval, `spec` starts `exo run <brief> --detach` itself: a background run whose phase sits in `.exo/run/<id>/state.json`, a lock refuses a second run in the same checkout, `exo status` shows each run, and `exo run --resume <id>` continues one whose process died; a brief in an issue or a refused start falls back to the `--fresh` command.

## 0.128.0 - 2026-10-11

### Added

- `benchmarks/results/2026-10-11-test-pollution.md` now records the `value-export-mismatch` check (baseline 5 of 5, exo 4 of 5) and the dropped `find-cause-success` branch.

## 0.127.1 - 2026-10-11

### Changed

- `score.mjs --publish` now publishes a value-only run and a flow run, so those results no longer need writing by hand; template publish is unchanged.
- `benchmarks/sweep.mjs` records the plugin commit (`pluginCommits`, `pluginDirty`) in `meta.json`.

### Fixed

- The budget constants and `edit-skills` no longer say the session hook injects `route-skills` with a 518-token ceiling; it injects `hooks/session-routing.md`, and `route-skills` follows the normal skill ceiling.

## 0.127.0 - 2026-10-11

### Added

- `benchmarks/results/` now records the test-pollution value runs (seven `find-cause` versions) and the flow runs of 2026-10-11: exo never passed test-pollution, and on the four-task plan exo used 76% more weighted tokens than the baseline at equal quality.

## 0.126.0 - 2026-10-11

### Added

- `benchmarks/split.mjs` splits flow cells by token type, call count and context size, so a change to the build flow can be measured against earlier runs.

### Changed

- On the inline route, `build` now runs `verify.mjs` once when the last task lands, with no `exo:verify` load, no tail reference read and no `--reviews-only` run; any line that is not clean, or `--land`, still falls back to the full `verify`. One 4-task flow run dropped from 15 to 13 calls and from 94.0k to 87.5k weighted tokens, hidden check passing.

## 0.125.0 - 2026-10-11

### Added

- `plan-check` now refuses an app plan whose Success criterion runs no product. A bin, a start script or an `mcp:` call must be the first backticked command, or the plan states `Product run: none (<reason>)`.

### Fixed

- A `package.json` holding `null` no longer counts as having an entry point.
