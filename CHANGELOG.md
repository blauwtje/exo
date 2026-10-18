# Changelog

Versions follow [Semantic Versioning](https://semver.org/spec/v2.0.0.html). A
skill's trigger, a skill or agent name, and the `exo:` namespace are the public
surface: renaming or removing one is a breaking change, adding one is a minor
release, and a body rewrite that keeps the trigger is a patch.

Versions before 0.134.8 are in [CHANGELOG-archive.md](CHANGELOG-archive.md).

## Unreleased

### Highlights
- **exo no longer blocks risky git commands, destructive shell commands or shell reads of secret files; set `permissions.deny` rules or the sandbox in your own settings to keep them blocked.**
- **A new session now orchestrates efficiently and picks a fitting model and effort per agent by default; set `budget` to `off` to keep the old behavior.**

### Added
- A detached run reports each session's cache read share and warns when turn 1 writes a large cache.
- plan-check warns on adjacent tiny plan tasks.
- plan-check flags a task that names a lock constant, such as `SESSION_LOAD_LOCK`, when its Files omit the file that defines it.
- A detached run denies `npm publish`, Vercel, Netlify and Fly deploy commands.
- A detached run saves the commit its branch review saw, as `pre-fix-head` and `pre-fix.patch` in the run log folder, before the review fix lands.
- Land refuses a task whose `Data:` names a backticked string found nowhere in its change or the tree, unless the task sets `Literals: none (<reason>)`; the code rules fail on uneven spacing around `=` and a missing space after a comma.

### Changed
- A repeated mistake in exo development now gets a check in `npm run check` or a fix on its code path, not a new hook, since each hook adds work to every session.
- The edit-skills style guide now enforces a rule that must always hold with a check in `npm run check`, not a new hook.
- A session sends each part of a request with two or more parts to its own agent, all in one message; a skill that matches one part takes only that part.
- A detached run's sessions get no session-start context, so each session caches about 900 fewer tokens.
- verify no longer warns about a task's listed file that its commit leaves unchanged; that warning was 596 of 626 WARN lines in recent runs.
- A headless run lands a closing task that only adds one changelog line by script, without a model session.
- A headless run builds doc-only tasks one model tier lower, reruns a red Proof at most once per edit and logs the model of each session and the finding count of each review; the lead ends its turn after starting a detached run.
- `npm run check` keeps only the tests that guard against real damage and drops the verifier self-test.
- `exo:prompt` rewrites ask for evidence of success, give each added line a short reason, add a review rule, guard tests in change and build prompts, keep a "start your answer with" ask as a format line and keep the pasted-text id on long documents; the keep-working line goes in only when no one will be there to answer, and four examples sit in `skills/prompt/references/examples.md`.
- CI pins each GitHub Action to a commit SHA.
- The javascript syntax check parses scripts in parallel and skips git-ignored folders such as `tmp/`.
- A headless run passes `--exclude-dynamic-system-prompt-sections` to each session, so the system prompt caches across sessions.
- A headless run passes a per-kind `--max-turns` turn cap to each session, and verify's Opus review gets a tighter turn cap.
- A headless build session's report comes from its final reply, not a separate file write.
- `exo:run-unit` uses a 1-hour prompt cache.
- A task that hits its turn cap stops as blocked, and its partial work goes to `.exo/carry/task<n>-partial.patch`.
- A weekly scheduled run cuts a release when `## Unreleased` holds an entry.
- A push to `main` cuts no release; `gh workflow run release.yml` cuts one on demand, with an optional `level` input.
- The context limit denies only subagents and detached run sessions; the main session gets a note at the soft limit and at the cap, never a deny.
- The context cap is one setting, `defaults.contextLimit` in `lib/run-providers.json` or `~/.config/exo/run.json`; the soft limit is 60% of it and `contextBudget` is gone.
- The `budget` setting defaults to `balanced`, so exo agents and general-purpose agents get a fitting model and effort without setup.
- Each session's start rules say the lead orchestrates, briefs agents to write findings to a file, sets each agent's model and effort, and keeps a progress file for long work; about 170 more tokens per session.
- A run's plan session writes files with batched Writes and no heredoc, and skips the separate code-rules step that `--check` already runs; in the flow benchmark exo fell from 66 s to 47.5 s and from $0.150 to $0.104 per cell (n=4).
- A run with `Land: local` or `push-main` now lands on `main` as one squash commit titled by the plan's new `Commit:` line, its body listing the run's commits and `Plan-task:` trailers.
- `exo:prompt` lists dropped user lines, keeps role lines that set a perspective, leaves visual detail to `exo:design-ui`, and adds test-first only when a test command exists.
- plan-check refuses a red-less task whose Files are all tests, flags unlisted tests, locks and registries, and prints the token size of each task; the spec brief states its Acceptance citation rule and keeps stored plans uncommitted.
- `exo:prompt` asks no questions before its rewrite; an unclear point stays open in your words, and your ok runs the rewrite as written, without `exo:spec`.
- Skills gained worked examples where format matters: a rule that sets output format, tone or detail keeps 3-5 varied examples, and `find-open-points` carries them.

### Fixed
- A run now logs `task <n> not landed by the script` when the land check it reruns after a plan repair fails, instead of saying nothing until the next session.
- A benchmark flow-run's confined `claude` now ends when the process that started it dies without a signal, instead of running on under pid 1; the wrapper checks its parent every `EXO_PARENT_POLL_MS` (default 1000).
- A run no longer repeats the red check after a no-red repair that left the Proof and `Red:` unchanged; the task runs again at once.
- The benchmark dry-run projects cost per effort level and counts cells priced from a fallback that does not match model and effort.
- A plan session that lands several tasks now counts once in the `total:` and `average per task` lines of a run, not once per task.
- A hand-run of the session-start hook, or a pressure session on a clone, no longer points `~/.claude/exo/plugin-root` at that copy.
- Detached run sessions get rules against `cd`, heredoc and `sed -i` edits and direct `decisions.md` writes, which caused 205 denied calls in 10 days, and may run `git grep`, `git branch --show-current` and `git worktree list`.
- A skill step that resumes an agent with SendMessage dispatches a fresh agent when SendMessage is unavailable.
- Pressure runs use a mirrored home with default exo options, so the user's own global options no longer change their results.
- Ship offers to file a follow-up the user names as an issue, in place of only saving a memory note; it files nothing before a yes.
- Benchmark cells under the macOS sandbox let git refresh its xcrun cache, so each git call no longer costs about 0.4 s.
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
- Runs rebase onto origin before each task and at review start, so a conflict parks the run before review, not at land; exo status and exo wait show since when a stopped run waits.
- The review benchmark scores a reviewer by the lines its findings name, and replays past reviews per model with `--set replay --cases <file>`.
- Seeded review cells in the benchmark name their findings path, so the sweep scores them; replay cells get their plan and the run's implementer reports inside the checkout, so a reviewer no longer stops for a missing plan.
- The review benchmark's clean control samples now handle a NUL byte in a name, CSV quotes, a BOM, non-decimal amounts and idle rate-limit keys, so a `fix` finding on a control is a real false alarm; controls with one fell from 3 of 5 to 0 of 5.
- A run now records its stop on SIGTERM, SIGINT or SIGHUP, writes report.md at start and resume, keeps a Mac awake, time-limits its reviews and logs sleep as idle.
- land-task refuses a test-first task whose change adds no test, land-run reruns the Success criterion when the tree changed after its last pass, a repair session records decisions through `run-decision.mjs` and the Stop hook lets a finished repair session end.
- A task whose Proof runs no test, such as a grep, is no longer test-first, so verify, the branch reviewer and the builder no longer ask it for a new test.
- Run sessions now check landing and the plan's Land gate before they report done, and task sessions can no longer edit the plan.
- Pressure runs count tokens over every turn and subagent, and run each session in a git repository, so worktree Agent calls work.
- The red check stops a base run that outlives the head run by `EXO_RED_BASE_MARGIN_MS` (default 60 s) and counts it as red, so a hung or slow base no longer waits 9 minutes or fails the task.
- The run log shows weighted session tokens, cache reads at their price weight and output from the result usage, not every turn's whole context summed.
- A build lead starts no extra session to wait on a run; the run hook wakes it.
- Benchmark checks judge small samples soundly: Agresti-Caffo pass-rate gaps, no ±0 for one cell, a per-task cut spread and cost printed to its spread; dry-runs and the sweep plan project time and cost, and run meta records a dirty plugin tree.
- The plan check pairs a file with a name-matched test only when the test names that file, so a `benchmarks/run.mjs` edit no longer demands the `run-session` tests.
- Benchmark forecasts say unknown or at least, not $0.00 or 0.0 min, for cells with no past record, and a published cut with no task in both arms stops with an error.
- `exo:prompt` shows a prompt asked for use in another session as that finished prompt, with no offer to run it, and keeps from pasted chat history only the lines the task needs.

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
