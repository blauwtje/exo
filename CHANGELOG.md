# Changelog

Versions follow [Semantic Versioning](https://semver.org/spec/v2.0.0.html). A
skill's trigger, a skill or agent name, and the `exo:` namespace are the public
surface: renaming or removing one is a breaking change, adding one is a minor
release, and a body rewrite that keeps the trigger is a patch.

Versions before 0.134.8 are in [CHANGELOG-archive.md](CHANGELOG-archive.md).

## Unreleased

### Highlights
- **exo no longer blocks risky git commands, destructive shell commands or shell reads of secret files; set `permissions.deny` rules or the sandbox in your own settings to keep them blocked.**

### Added
- A detached run reports each session's cache read share and warns when turn 1 writes a large cache.
- plan-check warns on adjacent tiny plan tasks.
- A detached run denies `npm publish`, Vercel, Netlify and Fly deploy commands.

### Changed
- A headless run builds doc-only tasks one model tier lower, runs the overlap review on a standard-tier model, reruns a red Proof at most once per edit and logs the model of each session and the finding count of each review; the lead ends its turn after starting a detached run.
- `npm run check` keeps only the tests that guard against real damage and drops the verifier self-test.
- CI pins each GitHub Action to a commit SHA.
- The javascript syntax check parses scripts in parallel and skips git-ignored folders such as `tmp/`.
- A headless run passes `--exclude-dynamic-system-prompt-sections` to each session, so the system prompt caches across sessions.
- A headless run passes a per-kind `--max-turns` turn cap to each session, and verify's Opus review gets a tighter turn cap.
- A headless build session's report comes from its final reply, not a separate file write.
- `exo:run-unit` uses a 1-hour prompt cache.
- A task that hits its turn cap stops as blocked, and its partial work goes to `.exo/carry/task<n>-partial.patch`.
- A weekly scheduled run cuts a release when `## Unreleased` holds an entry.
- A push to `main` cuts no release; `gh workflow run release.yml` cuts one on demand, with an optional `level` input.
- The context limit acts only on subagents and detached run sessions, not on the main session.
- A run with `Land: local` or `push-main` now lands on `main` as one squash commit titled by the plan's new `Commit:` line, its body listing the run's commits and `Plan-task:` trailers.
- `exo:prompt` lists dropped user lines, keeps role lines that set a perspective, leaves visual detail to `exo:design-ui`, and adds test-first only when a test command exists.
- plan-check refuses a red-less task whose Files are all tests, flags unlisted tests, locks and registries, and prints the token size of each task; the spec brief states its Acceptance citation rule and keeps stored plans uncommitted.

### Fixed
- A finished detached run wakes only the session that launched the run; a run with no recorded owner wakes no one.
- The red-green check runs the head side on the committed HEAD, so uncommitted edits no longer change its verdict.
- A session that edits to repair the Success criterion lands its edits through `land-task --fix`, so the run judges committed work only.
- Land runs every test file named in a task's diff or Files, so a stale test fails before the run ends.
- `exo-cli.mjs run` passes the launching session to the run as its owner, on resume only when set.
- The unattended plan-check call passes `--root`, and plan-check fails when the plan's root does not exist.
- plan-check sizes a plan task at bytes / 4, as `task-list.md` says, not bytes / 2.
- A run's tail now proves the Success criterion before it pays for a review, and a resumed run reuses a review of an unchanged tree.
- verify warns instead of failing a test-first task whose commit adds no test when a later `fix` repair commit changes a test in its Files, so such a run can still pass.
- A headless run stops a task only when a failed attempt repeats an earlier one, caps failed attempts run-wide, and retries the review fixer once.
- A task whose Proof runs no test, such as a grep, is no longer test-first, so verify, the branch reviewer and the builder no longer ask it for a new test.
- Run sessions now check landing and the plan's Land gate before they report done, and task sessions can no longer edit the plan.

### Removed
- The git guard and the secret guard on Bash: force push, `reset --hard`, `clean -f`, a stash drop, a branch force-delete, a whole-tree checkout and a shell read of a `Read(...)`-denied path now pass.
- The destructive-command guard, the comment guard, the run gate hook and the `guards` setting.

## 0.135.0 - 2026-10-15

### Added
- run.json `promptCacheTtl` picks a 5-minute (default) or 1-hour prompt cache for detached run sessions.

### Fixed
- The sandboxed task prompt says any output restarts the 60-second silence count, so a slow Proof that prints progress runs.

## 0.134.16 - 2026-10-15

### Fixed
- A resumed retry adds only its own cost to the run budget and session log, not the first try's cost again.

## 0.134.15 - 2026-10-15

### Changed
- `npm run check` fails when a changelog line added since the last release sits under a released `## <version>` heading.

### Fixed
- A detached run's task session runs land-task's code-rule check through `--code-rules` on its task files before it ends, and fixes every finding.
- A pinned plan session can run `land-task.mjs --code-rules` on any task of its plan and sees every finding, and the changelog placement check fails when its `git diff` fails.

## 0.134.14 - 2026-10-14

### Fixed
- A detached run checks the tracked tree for changes twice, not three times, and run-plan preflight runs plan-check again after the plan-check script changes.

## 0.134.13 - 2026-10-14

### Fixed
- A run skips four repeated steps: a full task session after a no-red repair, a Proof rerun after the decisions file changes, repeated commit-log reads on resume, and a repeated preflight plan-check on an unchanged plan and HEAD.

## 0.134.12 - 2026-10-14

### Fixed
- A land refused for a code rule now lists every code-rule limit, so a retry no longer fixes one rule and breaks another.

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
