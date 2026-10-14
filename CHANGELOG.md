# Changelog

Versions follow [Semantic Versioning](https://semver.org/spec/v2.0.0.html). A
skill's trigger, a skill or agent name, and the `exo:` namespace are the public
surface: renaming or removing one is a breaking change, adding one is a minor
release, and a body rewrite that keeps the trigger is a patch.

Versions before 0.132.3 are in [CHANGELOG-archive.md](CHANGELOG-archive.md).

## Unreleased

### Fixed
- A detached run refuses an uncommitted plan before it starts.
- `exo wait` prints why a run stopped and what to do next, `exo approve` for a parked run.
- A rewritten plan with the same file name builds its tasks instead of counting an earlier plan's commits as done.
- The status line counts the plan's tasks from the start.
- A review fix that stops the run leaves a clean tree and its edits in a patch in the run's log dir, and names any edits it could not clear.

## 0.134.2 - 2026-10-14

### Fixed
- The branch review reads only the current plan's proof files, not a stale one from another plan.

## 0.134.1 - 2026-10-14

### Fixed
- The mid-run plan repair check passes `--run`, so growth from earlier tasks no longer flags a task.

## 0.134.0 - 2026-10-14

### Added
- `npm run check` runs `claude plugin validate` when Claude Code is installed.

### Changed
- Compression now has three levels: off, short and shorter. Short is the new default and gives short replies in small, easy words. Shorter gives just the answer and key facts. Old settings keep working: low reads as short, and high reads as shorter.

### Fixed
- The plan check flags a refactor task with no Red field, and a Proof test that no task in its chain lists in Files.
- The plan check measures a running build's task size at the branch start, so growth from earlier tasks no longer refuses a resume.
- A build run's repair session can edit the plan, so a task missing one file from its list is repaired instead of stopping the run.
- The run watcher loads again and shows the run line beside a custom status line.

## 0.133.4 - 2026-10-14

### Changed
- The run line under the prompt is now a bar, count and clock, such as `▰▰▰▰▰▰▰▱  7 of 8  ·  10:48`, with no warning sign or doubled `exo`; its time moves on every redraw and it shows only the current worktree's run.

### Fixed
- The run watcher no longer sends a stale stop prompt after a resume, or while a wait or a background agent already watches the run; a real stop still prompts once.
- On a resume, the plan check skips the size of tasks that already landed, so their grown files no longer refuse the run.
- A stopped, crashed or parked run's report shows the range its tasks committed, not `Landed: none`.
- A builder the sandbox kept from running its proof no longer spends one of the task's tries the first time the run's own proof fails it.

## 0.133.3 - 2026-10-14

### Highlights

**The verify gate now says `UNPLANNED` instead of `STRAY`, and branch reviews say `concern` instead of `hazard`.**

### Changed

- The verify gate prints `UNPLANNED <path>` for paths outside the plan, and branch reviews weigh findings as `concern`.

## 0.133.2 - 2026-10-14

### Fixed

- A run skips the fix review when the fixer changed nothing.
- A run records its branch review after a landed fix, so verify does not review the same tree again.
- The branch reviewer reads `Red: proved` from land's proof files, not only implementer reports.

## 0.133.1 - 2026-10-14

### Changed

- Land reuses a cached `npm run check` pass for the same tree.
- Verify skips the branch review for a tree the run already reviewed.
- Spec bounds research to one `exo:fetch-docs` round and skips open points for small static plans.
- Verify's gate lines explain the cached same-tree SKIP.

### Fixed

- plan-check flags a task whose Proof is the land gate and has no `Red:` line.
- A run repair may add a `Red:` field; a no-red-proof refusal is not retried.

## 0.133.0 - 2026-10-13

### Added

- `/exo:prompt <rough prompt>` shows your prompt rewritten for Claude, adds nothing you did not write, and runs it only after you say yes.

## 0.132.4 - 2026-10-13

### Changed

- A detached run now rebases onto `main` when it moves, before each task and at landing, instead of stopping.
- A run commits changes to `CHANGELOG.md` and plan docs that no task lists, and untracked files no longer park it.
- A blocked task is repaired once inside the run when the plan error is small and the repair edits only the plan, before the run stops.
- A hazard the review reports as unproven now starts the fixer, and the verify report names its lines in plain words.
- A new `env` setting copies gitignored `.env` files into the run worktree; the spec asks once about it before the run starts.

### Fixed

- A task no longer stops the run for a file outside the plan when that file is `CHANGELOG.md` or a plan doc.
- A plan Proof that names bare `main` after `git diff`, `git log` or `git show` now fails the plan check, since `main` may have moved.

## 0.132.3 - 2026-10-13

### Changed

- The `budget` columns now follow benchmarks for the 5.5 models. Reviews run on Opus from `balanced` up, `quality` steps build and investigate to Opus medium instead of Sonnet at higher effort, lookup and research on Haiku get more effort, and `fast` runs peer roles on Sonnet instead of the session's model. No cell uses `max`.
