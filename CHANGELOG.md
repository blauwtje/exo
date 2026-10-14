# Changelog

Versions follow [Semantic Versioning](https://semver.org/spec/v2.0.0.html). A
skill's trigger, a skill or agent name, and the `exo:` namespace are the public
surface: renaming or removing one is a breaking change, adding one is a minor
release, and a body rewrite that keeps the trigger is a patch.

Versions before 0.134.2 are in [CHANGELOG-archive.md](CHANGELOG-archive.md).

## Unreleased

## 0.134.11 - 2026-10-14

### Changed
- A retry after a failed land resumes that task's failed session with only the retry note, instead of a fresh session that rereads the plan, brief and files.

## 0.134.10 - 2026-10-14

### Fixed
- `exo:build` runs a plan's Success command once per tree when red-green is on: the final verify and a resume on an unchanged tree reuse red-green's recorded pass instead of running it again.

## 0.134.9 - 2026-10-14

### Fixed
- `exo:build` run reports count each model call's tokens once instead of once per content block, so per-task and total token figures no longer come out about 2.4x too high.
- `/exo:prompt` opens the rewrite's fenced block with at least three backticks, so a rewrite with no backticks or only inline code still renders as a code block.

## 0.134.8 - 2026-10-14

### Fixed
- `/exo:prompt` puts the goal and code facts in a `<background>` block instead of `<context>`, since Claude Code drops a `<context>` block when you copy the rewrite from the terminal.

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
