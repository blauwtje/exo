# Changelog

Versions follow [Semantic Versioning](https://semver.org/spec/v2.0.0.html). A
skill's trigger, a skill or agent name, and the `exo:` namespace are the public
surface: renaming or removing one is a breaking change, adding one is a minor
release, and a body rewrite that keeps the trigger is a patch.

Versions before 0.124.4 are in [CHANGELOG-archive.md](CHANGELOG-archive.md).

## Unreleased

### Highlights

- **`exo run` now builds a small plan in one session and lands it by script: in the flow benchmark it uses 1.23x the no-plugin baseline's tokens with the hidden check 4/4, against 1.76x for the `build` flow.**
- **A plan task's Proof and a plan's Success must now fail before the change: on the test-pollution benchmark `exo run` with this red-green gate passed 5 of 5, against 1 of 35 for the no-plugin baseline.**
- **exo now refuses new code comments at edit time and at landing, except a license header, a public doc comment, a link or a `why:` line; one capped `exo run` added 0 comment lines with the hidden check passing.**

### Added

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

### Changed

- The code standard is rewritten to four principles and bans comments except the allowed list.
- `land-task` refuses a task whose added code breaks the code rules, and verify sends each such line to the review fixer as a `fix` finding.
- Versions before 0.124.4 moved to `CHANGELOG-archive.md`.
- This repo builds plans through `exo run --detach`, and each plan ends with a task that writes its `## Unreleased` line.
- The `verify` skill body moves situational loop text into its references, so it fits its 2700-byte budget again.
- `verify` and the red check share one test-path rule, `isTestPath` in `lib/red-green.mjs`; a `-test.` suffix no longer counts as a test file.
- A builder flattens a too-deep block it touches.
- Comments in `skills/`, `lib/` and `hooks/` are removed, from 14.6% of lines to 0.0% disallowed; a comment on behavior forced by a library, browser, platform or protocol returns as a `// why:` line.
- Every exo question keeps its options in a fixed A, B, C order; the recommendation is marked where it stands and never moves an option to the top.

### Fixed

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

## 0.124.4 - 2026-10-11

### Changed

- Every session start, resume, clear and compaction now injects exo's routing rules after the settings line, so a clear bug report reaches `find-cause` and the `route-skills` description holds again.
