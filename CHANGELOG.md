# Changelog

Versions follow [Semantic Versioning](https://semver.org/spec/v2.0.0.html). A
skill's trigger, a skill or agent name, and the `exo:` namespace are the public
surface: renaming or removing one is a breaking change, adding one is a minor
release, and a body rewrite that keeps the trigger is a patch.

Versions before 0.133.3 are in [CHANGELOG-archive.md](CHANGELOG-archive.md).

## Unreleased

## 0.134.7 - 2026-10-14

### Fixed
- `/exo:prompt` wraps pasted text in `<pasted_content id="...">` tags with the same random id on both tags, as the Opus 5.5 prompting guide shows.

## 0.134.6 - 2026-10-14

### Changed
- `/exo:prompt` now reads the code it needs, asks at most 2 questions, and rewrites a lazy prompt into a tagged prompt for the session's model, with an `Added:` line listing what it added.

## 0.134.5 - 2026-10-14

### Fixed
- The review fixer writes a `Probe:` line under every finding it marks fixed, including a concern, so a fixed concern no longer fails for a missing Probe line.

## 0.134.4 - 2026-10-14

### Fixed
- A run stop the `exo wait` notification already reported no longer reaches the lead a second time.
- A review-fix gate failure already on the branch before the fix is reported as such, not as the fix breaking the gate.

## 0.134.3 - 2026-10-14

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
