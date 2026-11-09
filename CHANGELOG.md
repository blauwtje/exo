# Changelog

Versions follow [Semantic Versioning](https://semver.org/spec/v2.0.0.html). A
skill's trigger, a skill or agent name, and the `exo:` namespace are the public
surface: renaming or removing one is a breaking change, adding one is a minor
release, and a body rewrite that keeps the trigger is a patch.

## Unreleased

### Added

- `harnesses/capabilities.json` holds each harness's subagents, hooks, efforts and worker count, and a static check fails when an adapter, its hook events or its effort column disagree with it.
- exo installs into OpenCode with `node install.mjs --harness opencode`, generating `exo-<agent>` subagents and skills from the Claude sources.
- The Karpathy coding reading (think before coding, simplicity first, surgical changes, goal-driven execution) is a section in `docs/principles/prompt.md`.

### Changed

- The orchestrator hook adds a line that makes a `Workers: 1` part run inline on DeepSeek, so a single-worker part spawns no Agent.
- The SessionStart context puts the static rule text before the pointers and settings, so the cached prefix stays stable.
- `exo claude --provider deepseek` prints a notice on stderr when the run starts in peak hours, with the next off-peak time; the peak windows are `deepseekPeak` in run.json `defaults`.

- The adhd output style lists each change of a report as its own short bullet with its figures, drops the 3-bullet cap, and no longer names exo files or commands.
- DeepSeek Flash efforts: build (measured, 15/15 pass at low and high, low is cheaper and faster), plus unmeasured lookup, chore, orchestrator, judge at low and fix-review at high, in `kindEfforts`.
- Codex and OpenCode agents open with one shared outcome-first preamble holding the goal, the done-check, assumptions or BLOCKED, named files only and evidence as command output or `path:line`.
- Generated Codex agent files no longer write `sandbox_mode`, so each agent inherits the session sandbox.
- The quality workflow runs its check job on Node 22 and Node 24, so CI proves the Node 22 floor in `package.json`.
- The Reddit source reads posts and comments through Reddit's shreddit comments partial with no API key, after one search RSS call or from thread urls passed with `--url`, with a token bucket, bounded concurrency, one 429 retry and a `blocked` note naming the `site:reddit.com` web search fallback.
- The Karpathy flow-unit results compare only its 2 flow runs with the baseline and list run 1 as excluded.
- exo has 10 skills (build, configure, edit-skills, find-cause, gate, save-session, ship, spec, watch, write-docs) and 5 agents (orchestrator, task-runner, build-task, research-worker, review-branch), with the routing rule "Unclear: spec. Clear: build. Broken: find-cause. Leaving the machine: ship."
- build, gate, find-cause, ship, write-docs, edit-skills and watch run in `exo:orchestrator` through `context: fork`, so workers report to the orchestrator and only its verdict reaches the main session.
- spec asks its questions in the main session and hands steps 4 to 8 to one orchestrator dispatch with per-hop context budgets.
- research, ideate and check-docs run as spec modes; run-plan, refactor, improve and design-ui as build modes; review as a gate mode; prompt rules live in edit-skills.
- Shared rule files and the handover template moved from `skills/route-skills/` to `lib/references/` and `lib/assets/`.
- The session rules drop the line on reading the docs before choosing a fallback for missing data.
- The context reference points to the session text for the T1 to T6 triggers instead of repeating them.
- The session start prints the exo settings line only when a setting differs from its default.
- README lists the skills, the agents and the routing rule; each owner page names its folded skills in a `## Modes` section.
- The `check-docs` mode of `spec`, the `file-issues` mode of `ship`, its duplicate-search script and the gate's `review-dispatch` page are removed; none was used in 30 days or the gate step script prints the same lines.
- `spec`, `ship` and `find-cause` each keep their short step pages in one reference page: `step-rules.md`, `pr-merge.md` and `loop.md`.
- 23 benchmark result files that no other tracked file names are deleted; git history holds them.
- The consolidate plan records its tasks and prune paths as landed.
- The session rules tell the lead to wait for the next notice of an agent that still waits on background work instead of stopping it, since that agent now resumes on its own.
- The adhd output style keeps replies short and plain: at most 3 one-sentence bullets, no greeting, preamble or recap, and no technical terms unless the user must type them.

### Removed

- The "Decided for you" list at the end of replies and its number-reply rule; exo still asks for an irreversible step, a choice with no safe default and a choice only the user can settle.

### Fixed

- Sweep records on DeepSeek are priced from usage at the Flash list price with a peak factor, and carry `cacheHitTokens` and `cacheMissTokens`; the replay of 40 kept runs drops from $24.27 to $0.999, matching the sweep's $0.999 at the peak rate.
- `lib/check-citations.mjs` verifies a Reddit quote from the saved page beside the cites file and fetches only when none is saved.
- The end-of-run Cost line logs `cacheHitTokens` and `cacheMissTokens` for the run.

- The Reddit source script tries `www.reddit.com` after `old.reddit.com` and, when both are blocked, names a `site:reddit.com` web search as the next step.
- The gate reads the plan's `Baseline:` line from the spec commit, like `Benchmark-override:`, and falls back to the working-tree line when that git read fails.
- `harvest-cases.mjs` now reads its `--out` value, scrubs the case id and ignores a home shorter than two characters; `mapItems` throws on a non-finite `costUsd` instead of running past the cap; a `flow-large` sweep cell is scored against its six tasks; the nano variant check fails when the hook registry is gone without being declared.
- Starting a run commits pre-existing work when the plan folder is gitignored.
- The lead checks an agent's output file, log or `ps` before it tells the user the agent still runs, and a worker waits for its own background process in the foreground instead of ending its turn.
- The gate no longer tracks run notes and names `plugin.json` in the plan.
- Bash commands that the harness moves to the background are now tracked as running shells.
- The remember-removed test counts only skill directories, so a stray `.DS_Store` no longer fails it.
- A benchmark command that times out now stops its whole process group, so leftover child processes no longer hold the run open.
- The commit guard now refuses a commit message whose `Evidence:` line names neither a `benchmarks/results` or `benchmarks/pressure` file nor `none (<reason>)`, and shows both valid forms.

### Added

- `tests/run-watch-final-phases.test.mjs` fails when the `FINAL_PHASES` copy in `hooks/run-watch.mjs` drifts from the original in `skills/build/scripts/run-state.mjs`.
- The context-limit hook refuses a web fetch of a Reddit host or mirror and a web search that names Reddit without `site:`, and its message points to the Reddit source script and the `site:reddit.com` fallback.
- `benchmarks/baseline-compare.mjs` and `node benchmarks/sweep.mjs --baseline <file>@<sha>` compare a results file with a baseline, list each run that skipped the flow under `Excluded:` and give a `Verdict:` per metric.
- The gate prints `FAIL benchmark` when a plan's success rate drops against its `Baseline:`, or when cost or wall time rises past both the noise bound and run.json `defaults.benchmarkMinRise` (0.10).
- A `Benchmark-override: <reason>` line counts only when it was in the brief at its spec commit, and the squash commit body carries it.
- `npm run check` fails a results file whose baseline comparison counts a run that skipped the flow.
- Benchmarks gain a flow-large cell, a nano variant, ablation variants, a frontier verdict, spoken routing prompts and a failed-run case harvest.
- When the lead starts an exo skill whose topic differs from the session's (spec, build, gate, ship and find-cause count as one topic), the existing Skill hook suggests a fresh session; no hook runs on each prompt.
- `lib/map.mjs` runs a list of items under a spend cap, and `lib/check-citations.mjs` checks quoted sources.
- A worker report must give a source beside every figure, and the gate prints a changed-file tree for a large branch.
- `improve-speed.mjs` scores `--measure firstEditCalls`, the mean build-task tool calls before the first edit per cell.
- `benchmarks/usage-count.mjs` counts how often each skill, agent, hook and lib file is loaded, read or invoked across session transcripts, with `--all-projects` and `--sessions`.
- The research page fetch reads public Google Sheets through their CSV export route.
- The research page fetch detects Cloudflare challenges, age gates, non-public and empty pages, labels them `status: blocked <reason>`, saves no gate text and prints the `--save` command for the user.
- A blocked research page falls back to the Wayback snapshot (labelled `archived <date>`), the Khoros board feed, then an optional Playwright render when `playwright` is installed, each checked again for challenges.
- The research page fetch follows the same-origin confirm link or form of an age gate on a public page.
- `node benchmarks/ideate-worker-score.mjs` judges the `ideate-worker` at sonnet:low, sonnet:medium and opus:low from the `agent-tier.mjs --agent ideate-worker` transcripts (`--dry-run`, quick by default, `--tier full`, `--max-usd`).
- `node benchmarks/ideate-tokens.mjs` measures one ideate run per mode (`--dry-run`, quick tier by default, `--tier full --confirm` for both modes) and writes token totals per model to `benchmarks/results/ideate-tokens.md`.
- GitHub search hits from `research` carry the repository description on stdout and in the source ledger.
- `/exo:ideate <design question> [fast]` writes the top 3 ideas to `.exo/ideate/<slug>/report.md` with a source, a risk, a first step and an already-exists mark from GitHub, through persona subagents on the new sonnet `ideate-worker` agent.
- `/exo:research <question>` answers with a short cited report from keyless web, Reddit, GitHub, Hacker News, Stack Overflow, Wikipedia, arXiv, podcast and YouTube sources through the new `research-worker` and `claim-judge` agents, and `verify.mjs` blocks the report until every quote is on its cached page and every footnote maps to a stored claim.
- Once `suite-shadow.jsonl` shows `changedTestsTrialRuns` (run.json `defaults`, 10) consecutive full runs with no miss, a whole-suite proof runs only the changed tests, with a full run every that many runs; a miss restarts the count.
- Checks flag rule lines copied across agents and `.mjs` modules over 8 KB, and the no-delete rule now reaches every agent that has Bash from one guard row.

### Changed

- gate: one step script (`gate-step.mjs`) runs the mandated gate steps and prints one line per step with a digest of a failing step, so the lead reads fewer references and logs and makes fewer script calls.
- Translate all Dutch text in the repo to English, and name no example language in rules and docs.
- `exo:prompt` reads its request-kind and model rules from references per request, and `validate:static` checks that skill selector pointers resolve and that no moved line stays duplicated.
- The decided-for-you heading follows the user's language, and the decided benchmark parser accepts it.
- Before a safe default, recommendation or question, exo checks every option against the criteria the request or repo sets and takes the winner, and each decided line states `because <criterion>`.
- The research worker brief drops its `Result:` line, because workers store claims in `claims.jsonl` and write no result file.
- The `ideate-worker` runs at sonnet medium instead of low, because an earlier idea worker at low effort came up with weaker ideas and cost 1.9x more over its rounds.
- The general build worker drops to sonnet low because agent-tier general-build and general-read show equal or better pass at about 15% lower cost.
- A capped agent Bash result names its saved log only when the output is cut, so each uncut result drops a 131-byte `output log:` line that every later turn re-read (about 10 M tokens a week in this repo).
- The static verifier parses every script in one process (`verify/parse-scripts.mjs` with `vm.SourceTextModule`) instead of one `node --check` per file, which cuts the Land gate `npm run validate:static` behind `land-task --check` from about 11.2 s to 4.4 s.
- The land step runs the covering tests of the changed files side by side through `lib/test-pool.mjs` instead of one after another, so 27 covering files for two changed files take 23 s, not over 60 s.
- The build speed and cost judge counts real sessions (`benchmarks/session-stats.mjs`) with verdicts `worse`, `not-shown` and `better`, screens frontend-only steps on flow-web under `ideaScreenCapUsd`, leaves the `ideaConfirmCapUsd` confirmation to a hand-run `--full`, and `benchmarks/README.md` and `CONTRIBUTING.md` describe it.
- A fresh `exo run <plan>` adopts the plan's earlier unfinished run, `state.json` keeps the spent money so the spend ceiling counts it after a resume, and a plain `exo run` resumes a parked run once no gate is open and its stop is resumable.
- Every `exo run` stop (spend ceiling, autonomy pause, parked, breach, blocked, cap, signal) goes through one `stopRun` in `run-plan-stops.mjs` and writes `stop` (`kind`, `reason`, `task`, `resumable`) into `state.json`.
- The start cheat sheet is generated from skill frontmatter and checked for drift, so new skills appear without hand edits.
- The kind table now sets when a subagent's effort follows the session effort, through a per-kind `ceiling`; find-open-points moves to the new `open-points` kind, unused kinds and `stages` are gone, and the model kinds check fails a kind nothing names.
- The verifier reads and parses each script once, runs the skill graph as a check, and `npm run validate` now runs validate:static and then the unit tests.
- Resume no longer re-sends the session rules that its transcript already holds, and a check fails any tool-event hook that has no matcher.
- Shared git helpers (`git`, `gitText`, `gitResult`, `gitLine`) in `lib/git.mjs` replace local `git()` copies, and a new check fails any new local one.
- The ship, spec, gate, build, find-cause, start and design-ui skills and four agent prompts are trimmed under their limits, with the moved rules in new references.
- The reference owner registry is a data file, `verify/reference-owner-rows.txt`, so a new reference file needs no check-code edit.
- The review judges under `benchmarks/review-judges/` are generated from `agents/review-branch.md`, and a check fails on drift.
- find-open-points keeps its `max` effort ceiling: in blind 8-brief A/Bs, high found 64.8% and xhigh 74.1% of the reference open points against 87.0% for max (`benchmarks/results/2026-11-07-fop-ab.md`, `benchmarks/results/2026-11-07-fop-xhigh.md`).

### Fixed

- The brief guard sizes `Fetches:` on research-worker briefs with web or docs sources, and benchmark fix-round counts read the fix mode marker through `benchmarks/fix-round.mjs`.
- A worker brief no longer names a result file with report, summary or findings in its name, which the harness Write guard refuses.
- `land-task.mjs` refuses a task or `--fix` commit whose `Evidence:` line is not a `benchmarks/results` or `benchmarks/pressure` path or `none (<reason>)`, by the rule the `edit evidence` check uses.
- The gate step script names each `[FAIL]`, `[WARN]` and `[UNRUN]` check line of a red `npm run check` in its `LOG` line.
- The gate step script says the merged review is blocked, and what clears it, instead of telling the lead to start repairs.
- The Codex adapter skips a run-state `.exo/` folder inside a skill folder, and a saved long Bash command goes to the repository root's `.exo/`, not the folder the session is in.
- The red-green check behind `land-task` no longer crashes with `EEXIST` when the worktree seed already copied `node_modules` into its temporary tree.
- The land lock no longer throws `spawnSync /bin/ps EPERM` inside a macOS sandbox: when `ps` cannot run it checks the owner with `process.kill(pid, 0)`.
- A second review merge at the same HEAD keeps its round and no longer blocks as recurring, unread changed files make the merge `BLOCKED`, code-rules concerns carry the review finding shape, and a fix whose `Sweep:` hits a line other than its `Quote:` is demoted to report.
- A build proof that runs a whole test suite also runs only the test files changed since its last full green, in shadow mode, and logs each miss to `suite-shadow.jsonl`; the full run still decides the land.
- A gate fixer writes `Before:` for each probe, and a finding whose probe already passed is demoted only when it still passes after the fix.
- `benchmarks/session-stats.mjs` skips every `claude -p` session as headless and counts one turn per message.
- Bash commands written for bash run as bash under zsh without a retry: any unquoted `$name`, `$1` or `$@` gets `shwordsplit` (not only a `for` loop list) and a `${name[i]}` subscript gets `ksharrays`, from one option table in `lib/shell-fixes.mjs`.
- `remove-worktree.mjs` removes the worktree of a branch that already landed on main by squash, though later commits touch its files, and `squash-check.mjs` says such a branch has nothing left to squash; the branch is kept.
- Generated Codex agents now carry the shared brief rules, such as no-delete, filtered by each agent's tools.
- The review-branch `Red:` rule names review-input.md and its one `Task <n>:` line per task again.

### Added

- `exo:watch` runs a voice activity check before whisper.node (the pinned 0.9 MB Silero ggml-silero-v6.2.0 model, fetched on first use into the plugin cache): a video with no speech skips whisper and gets the no-speech transcript, otherwise whisper hears only the window from the first speech start to the last speech end, and any VAD failure falls back to the whole file.
- `exo:watch` provisions a small ffmpeg decoder on first need (`@ffmpeg-installer`, 15 to 23 MB depending on the platform), so whisper.node reads any audio format and keyframes need no installed ffmpeg.
- `exo:watch` grabs 6 keyframes into `frames/NN.jpg` (long side 640 px) when a video has no speech or under 15 words of it, and the per-video line then ends ` frames=<dir>/frames (6 files)`.
- `exo:watch` transcribes a batch in one call, one video after another: repeat `--url`, or give `--from <file>` or `--from -` the `list.mjs` output; a finished video is skipped (`--force` redoes it), a failed one does not stop the batch, and a summary line counts done, skipped and failed with the failed ids grouped by failure.
- `exo:watch` paces its yt-dlp calls per host across processes (about 2 s plus up to 1 s of jitter, tune with `EXO_WATCH_GATE_MS`) with a lock file in the plugin cache that also works on Windows.
- The `notify` setting is an http(s) url, such as an ntfy topic, that `exo run` posts a one-line notice to when a plan is done, a task is stuck or a question waits; a failed post logs one line and never fails the run.
- A plan corpus under `tests/fixtures/plans/` holds one `ok` or `bad` plan per shape a plan-check fix repaired, and `tests/plan-check-corpus.test.mjs` pins each one's exit code and first refusal line.
- `/exo:start` with no goal prints a board of what is open in the repository (plans with landed tasks, parked or stopped runs, unmerged branches and worktrees, a saved session, briefs with open points) and the one next action, and falls back to the cheat sheet when nothing is open.
- `exo:spec` states a `Verdict:` of go, clarify or stop and the strongest `Objection:` before the brief, and `scripts/verdict-check.mjs` checks a brief holds both under `## Verdict`.
- `exo:file-issues` searches open and recently closed issues for each draft with `scripts/find-duplicates.mjs` before creating, shows the top matches with a reason and asks link or file; it never edits or comments on an existing issue.
- `exo undo <id> [--apply]` reverses a run's recorded ref moves from `ops.jsonl`, dry run by default; it backs up every moved ref, never deletes work and only reports worktrees and pushes
- `exo run --resume` continues inside the task it stopped in: `run-plan` appends a step journal (`journal.jsonl`) to the run directory, replays a finished builder session instead of spawning it again, and restores the failed attempts of the task in flight; `state.json` carries the latest `step` and the `ops` path a run-level undo writes to.
- `exo:write-docs` drafts release notes from the commits (and merged pull request titles through `gh`) between two refs with `scripts/release-notes-draft.mjs`, last release tag to `HEAD` by default: breaking changes with their upgrade step first, then Added, Changed, Fixed and Removed, no commit hashes, and `--uncovered` lists the commits missing from `## Unreleased`.
- Off by default (`EXO_WAVE_RESOLVER=1` or run.json `defaults.waveResolver`), a land-time conflict in a wave is kept on branch `exo-conflict-<n>` with both briefs and diffs and a resolver dispatch line, and `conflict-wave.mjs` lands it only when no marker is left and the Land gate passes.
- Each parallel wave slot exports `EXO_SLOT`, `EXO_PORT_BASE` and `EXO_STATE_DIR` to its setup command and `.exo/slot.env`, so servers and local state in parallel proofs stop colliding; `EXO_SLOT_PORT_START` moves the port range
- `exo:ship` turns each reviewer file-and-line comment on a pull request into one findings file with `scripts/pr-comment-tasks.mjs --pr <n> --root <checkout>`, so `gate`'s fix-review runs once per comment and the Land gate reruns, and it skips resolved and outdated review threads.
- `/exo:run-plan ci` writes a GitHub Actions workflow that runs `exo run` on a plan named in an issue comment `/exo run docs/plans/x.md` or the label `exo`, with the agent job on a read-only token, the branch handed over as a git bundle artifact, and a second job that pushes it and opens the pull request, for OWNER, MEMBER and COLLABORATOR authors only.
- `exo:spec` offers a saved plan template from `docs/plans/templates/` when one fits, chains the repo done-list `docs/plans/definition-of-done.md` onto the Success criterion once, and `exo:run-plan` offers to save a landed plan as a template, through `scripts/plan-template.mjs`.
- `/exo:review` reviews a diff, commit, branch or pull request that has no plan, with the gate reviewer, and changes nothing.
- `exo run` stops with exit 4 after the task that reaches `--max-run-usd` or run.json `defaults.maxRunUsd`, warns at 80% and prints a cost receipt per task and per session kind, showing a session that reported no cost as unknown.
- A plan's `Autonomy: auto | pause-flagged | approve-each` line and a task's `Pause: yes` field park a headless run before the flagged or every task, through the same approve gate, and `exo approve` continues from that task.
- A task that fails its proof now appends a "tried X, failed because Y" line to `.exo/ruled-out/task-<n>.md`; the retry prompt, the find-cause investigator and save-session read it so a dead end is not repeated.
- `exo run` runs a session once on a fallback model when a provider overload outlasts the same-model retries (opus for sonnet, sonnet for opus, from the model table; `EXO_FALLBACK_MODEL=<model>` overrides, `off` disables) and writes the switch to the session log and the run report (`task 2 model sonnet -> opus`).
- The retry note `exo run` hands a task after a failed attempt now carries that task's ruled-out record and names the model switch when the session ran on the fallback model, built by one `failedAttemptNote`.
- `skills/spec/scripts/behaviour.mjs` builds `docs/behaviour/<area>.md`, one current-behaviour file per skill area, from the acceptance lines of the briefs git tracks under `docs/specs` and `docs/plans`; spec reads it, and the `behaviour files` check fails while a file is stale.
- A lesson written with a path glob in `--refs` reaches only the build briefs, `memory.mjs lessons --files` reads and spec runs for matching files; `verify` drops a lesson whose glob matches no tracked file, and `memory.mjs claude-md` proposes repository-wide lessons without writing `CLAUDE.md`.
- `exo:watch` writes each YouTube and Vimeo stamp as a link that opens at that second, so every cited claim is checkable, and labels speakers as guessed only when the captions carry speaker turns.
- `exo:design-ui` takes a screenshot, recording or URL as reference and reports the result beside it with a difference note and numbered regions mapped to component files by `scripts/regions.mjs`, so a follow-up edits one region's file.
- `exo:ship` proposes a commit split of a dirty tree, files grouped by purpose with conventional subjects, and `scripts/commit-split.mjs` applies it only on your yes, with a final tree equal to the original.
- `exo:ship` builds a plan branch into a stack of pull requests, one per wave, with `scripts/stack.mjs --plan <plan.md> --body <file>`, and `--restack` retargets the children after a squash merge; `stack` is a value of the `ship` setting.
- A worker that nears its context limit runs `skills/build/scripts/checkpoint.mjs` to commit its work with a `Plan-checkpoint:` trailer; `land-task` folds those commits into the one task commit and accepts a stopped worker whose handoff or checkpoint stands in for a missing build report; the next brief of that task names its `.exo/handoff-task-N.md` and latest `Plan-checkpoint:` commit.
- The `budget raises` check fails a raised value in `verify/budgets.mjs` unless a commit in the branch has a `Budget-raise: <id> <old> to <new>: <reason>` body line, so a size budget is trimmed, not raised.
- `exo:watch` lists a profile, channel or playlist url from metadata alone with `scripts/list.mjs --url <url> [--limit <n>]` (default 20): one line per video with url, title, date, duration and views when known, nothing downloaded.
- `exo:watch` fetches the official yt-dlp release binary for the platform into the plugin cache, checked against its SHA2-256SUMS, when no yt-dlp is on PATH; ffmpeg and whisper stay optional for videos with no captions.
- The gate's code-rules scan flags a duplicated literal and an unused export as concerns, and a skipped branch review still sends the CODE-RULES findings to the fix step.
- The flow report adds median, MAD and outliers (beyond 3 scaled MADs) per arm metric.
- `usage.json` adds `byRole`, the tokens, cost and estimated Read-result tokens per agent type.
- `npm run check` parses every brief example in skill, agent and hook text with the real brief parser, and fails a delegate template without a `Reads:` line.
- `npm run check` fails when a skill, agent, hook or the Codex copy tells an Agent call to run in the foreground, except 3 listed lines that run in a subagent thread.
- `npm run check` fails when a file in `hooks/` or `lib/` other than `lib/read-estimate.mjs` turns a file size into read tokens or looks up the session images directory.
- `npm run check` fails when an agent can start a background shell or Monitor but has no TaskStop and no "start no background" rule.
- The speed ledger records the installed hook overhead per tool call across projects: about 80 ms per Bash call idle and 110 ms in transcripts, 70.6 of 7532 thread minutes in exo (under 1%), so hooks are not a cause of slow sessions.
- Files the user opens (run report, handoff, manual checks, orchestrator result file) follow one plain-words format in `skills/route-skills/references/user-read-format.md`, which says they hold no machine text, and `npm run check` fails a listed source that breaks it, that has an all-caps word of 3 letters or more besides PR, CI, URL and API, or that has a line where a quarter of the tokens are code.
- The hook timing benchmark has a `worker count read` case that times the orchestrator Bash step reading the slice file.
- Session start deletes the per-call Bash temp logs in `exo-bash/` under the OS temp folder once they are older than `EXO_SAVED_OUTPUT_MS` (one day).
- Agent context is budgeted before dispatch: a worker brief carries `Reads:`, optional `Fetches: <n>` (1600 tokens per page, measured at WebFetch p90 1549, n=4999) and `Result:`, and `hooks/agent-effort.mjs` refuses an orchestrator worker whose estimated reads pass half of `defaults.agentContextTarget` (60000), naming its three largest reads.
- An orchestrator runs one slice of at most `defaults.orchestratorWorkers` (4) dispatches, declared by a `Workers: <n>` line; the Agent hook refuses a missing line, n over the limit and call n+1.
- `skills/gate/scripts/context-peaks.mjs` reports peak context per agent type and the U1-U8 verdicts that prove or retire each unmeasured default.
- Ideas from google/elephant-goldfish-model: `find-open-points` returns `Cannot follow:`, `Reuse:` and `Scope:` lines for brief parts it cannot follow, helpers that already exist and scope the Goal does not need, and the lead rewrites the brief from them; a dismissed point goes under Assumptions with its `path:line`; the gate stops a finding the fixer declined from returning as `fix`; `benchmarks/isolation-probe.mjs` checks from the dispatch events that `review-branch` and `find-open-points` never see a marker only the parent knows.
- `exo:watch` reads one or more YouTube videos through their transcripts, manual captions first and then auto-generated ones in the video's own language. `skills/watch/scripts/transcript.mjs` fetches them with Node alone, so a YouTube video with captions needs nothing installed; it uses yt-dlp only when yt-dlp is already on PATH and the direct fetch fails. The transcript is written under `.exo/watch/<id>/` and stays out of the session. A video over 10000 tokens is split into 30-minute chunks, and one `lookup` delegate per chunk returns notes with `[mm:ss]` stamps. A YouTube video with no captions falls back to local transcription as the later `exo:watch` entry describes, and gets one `no transcript:` line only when that fails. A live run with no yt-dlp installed fetched a 1:56:20 lecture's 21030-word transcript in 3 chunks with 30 chapter headings.
- Every `exo: gap` in `docs/principles/eval.md` is closed. Each paid benchmark dry run prints a power line: the tasks needed to detect an effect of 0.03 at alpha 0.05 and power 0.8, and the smallest effect its task count can detect (`lib/eval-stats.mjs`). `benchmarks/judge-calibration.mjs` compares a judge's verdicts with human labels in `benchmarks/judge-labels/` by Cohen's kappa; a judge counts as calibrated at 30 labels and a kappa lower 95% bound of at least 0.6, and each judge scorer prints its status beside its score. The ideas judge grades originality and fit in separate calls, and `benchmarks/ideas.mjs` refuses to compare records scored by different judge prompts, so every older ideas baseline needs a rescore with `--score`. `benchmarks/suites.json` tags 19 suites as capability or regression, and `npm run check` runs the 6 free regression suites. `benchmarks/replay/scaffold-case.mjs` scaffolds a replay case from a fix commit; 12 new real-failure cases bring the replay set to 20, and no case's regex cross-check matches its own prompt. `exo:improve` gives every score run the same `EXO_SEED`, refuses a candidate that is not exactly one commit, prints the noise and smallest detectable gain at setup, lists the cases that moved most, and with 8 or more cases holds out a quarter of them, refusing a keep that clearly lowers them. New checks `eval-power`, `eval-judges`, `eval-real-failures` and `eval-suites` guard these, with their values in `defaults.eval` of `lib/run-providers.json`.
- `exo:watch` also reads TikTok, Instagram Reels, Facebook, X and other yt-dlp sites, and transcribes a video with no captions locally: yt-dlp fetches its audio, ffmpeg converts it, and whisper.cpp (`whisper-cli` with `--model`) or openai-whisper writes the transcript; a missing tool stops that video with an install hint, and nothing is installed
- A background shell an agent started now blocks its first result-file Write: `lib/live-shells.mjs` reads the agent transcript for `run_in_background` Bash calls with no `TaskStop` or finished notice, and the Write is refused once with the shell ids. It runs on the existing Edit and Write hook entry, so no hook entry or Node start is added.
- `npm run check` resolves `Step N` and `Steps N to M` references in skill, reference, prompt and agent files against the loaded skill's numbered steps, and fails on a prompt file's `forbidden-steps`.
- `npm run check` fails a skill or reference trim that drops a rule sentence found nowhere else in `skills/` or `hooks/`, with intended removals in `verify/rule-removals.txt`.

### Changed
- `exo:watch` retries a yt-dlp call that fails with 403, 429 or 5xx up to 3 times with a doubling backoff (`EXO_WATCH_BACKOFF_MS`, 5 s default), and a failure reads `rate-limited, retry later`, `private/removed` or the short reason.
- `exo:watch` transcribes a video with no captions without a tool to install: whisper-cli or whisper when on PATH, else whisper.node with the pinned ggml-base-q5_1 model fetched on first use (about 84 MB on darwin-arm64, checked by SHA-256), mp3, wav and flac are read as they come and other formats are decoded, the language is detected, and a video without speech gets the `no speech in this video` transcript.
- `exo:ship` writes a reviewer-ready pull request body with `scripts/pr-body.mjs` (why, changes by theme, read order, risks, the gate's own proof lines, follow-ups, capped at `defaults.prBodyBytes` 4096) and an acceptance table from the linked issue's checklist, one met, unmet or unverifiable row per item with its evidence.
- Gate review findings cite the rule they break and carry a category and a 1-10 score; `merge-reviews.mjs` groups them, demotes uncited ones and hides those under score 4 (`--min-score`, `EXO_REVIEW_MIN_SCORE`) with a count line.
- The land gate decides from the SUMMARY line of its own log (FAIL=0, and WARN=0 UNRUN=0 unless static), refuses an exit 0 whose log ends FAIL>0 or a check gate with no SUMMARY line, and skips only a cached pass whose kept log it re-reads.
- Every cached pass (land gate, Proof, Success criterion, red-green, gate) is read from its kept log by one reader in `lib/check-cache.mjs`: a SUMMARY line, or a node:test or TAP count, must show no failure, and a log of any other shape is rerun instead of trusted.
- A Proof that prints a failing node:test or TAP log is refused even when it exits 0, and a gate or Proof of unknown log shape still passes on exit 0 but records only its time, so a later run reruns it.
- The speed ledger records four measured rejects from the 61-repo research: parallel check steps, cheapest-first `--fail-fast` order, a per-step input-hash check cache and an early-prompt volatility audit.
- One rule table, `lib/guard-rules.mjs`, holds each guard row's deny reason, allowed form and brief line: the Bash, Edit, result-cap, context-limit, live-shells, run-no-wait, run-stall-guard, agent-effort (kind mismatch, orchestrator Workers line and spent slice included) and file-result-without-Write denies read their reason from it, rows with a `without` tool list render a brief line only for an agent lacking that tool (no Write, no TaskStop), the dispatch rules render the brief lines from it, and the commit attribution deny now checks `-F` files, heredocs and `--file=` as well as `-m`, and `npm run check` fails a literal deny reason in `hooks/` or `lib/` outside the rule table and `lib/brief-denials.mjs`.
- The agent-effort hook puts the brief lines of the receiving agent's tools, read from its `tools:` frontmatter, at the top of every dispatched Agent prompt after the `exo-kind:` line (once per prompt), so a subagent starts with its must-keep rules instead of meeting them as refusals; `Reads:`, `Result:` and the size check still read the original brief.
- The gate skips the branch review when every task only adds new files with a test and land-time `Red: proved`, which cuts the flow-unit median wall from 133.3 s to 80.0 s and mean cost by 39% at n=15.
- The speed ledger records ideas 7 and 8 as measured rejects: build-task and review-branch read no whole source or dependency files on the flow fixture, and their 23.0% and 13.4% read shares are rule docs and the review input.
- The speed ledger records two more flow-unit ideas: build-task rule docs as a stable prefix is rejected at under 3% of build-task cost, and a two-line build-task dispatch prompt missed the pilot bar at a 145 s median wall.
- Shared helpers replace local copies: `lib/basics.mjs` holds shellQuote, sleep, sleepSync and writeAtomic, benchmarks take mean, median and JSON reads from `benchmarks/basics.mjs`, and tests use one git helper and one tracked tempDir helper, 296 fewer lines.
- The largest scripts are split into one-concern modules: `land-task.mjs` (962 to 112 lines), `run-plan.mjs` (935 to 391), `exo-cli.mjs`, `gate.mjs`, `plan-check.mjs` and `lib/plan-tasks.mjs` now each stay under 400 lines, and the hooks no longer load `contextSeries`.
- `transcript.mjs`, `pressure.mjs`, `skill-graph.mjs`, `run-session.mjs` and `next-task.mjs` are split into one-concern modules under 400 lines, two benchmark Claude runs share `benchmarks/capture-child.mjs`, and `CONTRIBUTING.md` states the job-word rule once.
- An agent Grep or ToolSearch gets the head_limit or max_results that fit the context it has left, and a Glob or WebSearch whose largest output would not fit is denied, with the Glob steered to Grep; outside bypassPermissions and auto modes the Grep and ToolSearch are denied with that number.
- An agent Read over the context it has left is cut to the offset and limit that fit, with a note on where to continue, instead of being denied.
- An agent Read, Grep or ToolSearch over the context it has left is cut in every permission mode, not only bypassPermissions and auto, because the cut now returns `updatedInput` with no `permissionDecision` and the user's prompt still decides the call.
- Every agent's Read and Bash result is cut or refused against the context it has left, not a fixed byte cap, so a whole test log or saved Bash log can no longer be read in one call by an uncapped agent; the cut line names the saved log and steers to `grep -n` and a line range.
- A worker brief whose reads exceed the budget is rewritten to move the reads that overshoot into a `Search: <paths> (grep -n first, then read by range)` line instead of being denied; it is denied only when a single unranged file alone exceeds the budget or nothing can move.
- An orchestrator or task-runner over its context target can still use Agent, SendMessage, TaskStop and Monitor to hand work to workers until the hard limit; its reads and searches stay refused.
- An orchestrator's recursive `grep` or `rg` is rewritten to list matching files only (`-l`), because it has no Grep tool and a wide search floods its context.
- The handoff stub that `hooks/session-end.mjs` writes follows `handoff-template.md`: an answer line first, then Current state, Next step and Resume, in plain words, from `hooks/handoff-stub.md`.
- Hooks cost less per session: the `SubagentStop` hook is gone, the Read, web, Skill and MCP hook starts Node only for Read, Skill, a run session or an agent past its soft context limit, two Bash deny reasons are shorter, and `npm run check` fails when hook entries or hook text grow (`verify/checks/hook-cost.mjs`).
- The `exo:orchestrator` description tells the lead that its brief needs a `Workers: <n>` line with n from 1 to 4, so the first dispatch is no longer blocked and resent; the hook still refuses a missing line and n over the limit.
- An orchestrator does no work before its first dispatch: its Bash is refused until then, so discovery goes to a `lookup` worker. `sleep` in command position is refused for the orchestrator and task-runner, which end their turn and wait for the notification.
- Read and Bash results of capped subagent types are cut at `defaults.resultCapBytes` (4096 B) and `orchestratorResultCapBytes` (2048 B), with full Bash output kept in a per-call temp log; the lead, build-task and task-runner stay uncapped.
- A subagent Bash command over `defaults.scriptBytes` (4096 B) is refused; the orchestrator runs at `high` effort instead of `xhigh`; Grep and Glob are dropped from six agents that never called them.
- The project `.claude/CLAUDE.md` is rewritten as a 32-line, 401-word file that keeps only rules no hook, script, check or skill already enforces; its plan-loop, paid-eval and `### Highlights` details move to `CONTRIBUTING.md`, and its start-of-run, squash, worktree-removal and push steps move to `.claude/landing.md`.
- The Stop and AskUserQuestion hooks skip Node outside a run, which cuts them from about 31 ms to about 5 ms per call; in a run they still deny and block as before.
- `benchmarks/results/2026-11-04-block-context-budget.md` records why blocks are not cut by predicted runner context: plan features explain 23% of runner peak variance, and the cut would split 0 of 258 recorded blocks.
- `configure`, `improve`, `prompt`, `remember` and `start` are user-only with `disable-model-invocation: true`, so Claude no longer starts them and their descriptions leave the fixed context; type `/exo:<name>` to run one, and the session-start memory note and the docs now point at that typed command. The routing eval drops their 150 prompts, and `benchmarks/improve-real.mjs` drops its `routing-start` target.
- Every skill, agent, prompt, reference, hook text and project doc is rewritten as plain sentences with a goal line, reasons and defined terms, with rules unchanged, and a new `npm run check` step keeps them readable.
- Subagents load less context, from a study of 33 GitHub repositories and 10 recent Anthropic posts: `task-runner` reads only the reference each failure case needs; `build-task` skips the code rules for tasks that touch only `.md` files; the subagent start note is shorter and the soft-limit note arrives once per subagent; the session rules and the run task prompt drop duplicated lines.
- `output-styles/adhd.md` shrinks from 129 lines and 1259 words to 113 and 1001, and gives an advice or analysis answer as a verdict, the one new idea and the advice in plain words, with no paths or code terms the user need not type; `benchmarks/adhd/` scores a video-transcript analysis case, where answer-first stays at 100% and facts kept rises from 45.5% to 54.5%.
- Benchmark-started Claude sessions write their prompt cache at the 5-minute rate (CLAUDE_CODE_PROMPT_CACHE_TTL and CLAUDE_CODE_SUBAGENT_PROMPT_CACHE_TTL set to 5m), which cut about 5.8% of the subscription weight in a 14-day replay with the same model, effort and turns; rerun the base arm before comparing cost with an older result
- Runner-facing build scripts print only what the next step reads and write the full text to a `.exo/logs/<name>.log` file named by one `Detail:` line; a passing Proof prints one line; a runner waits on a restored `wait-report.mjs` (`EXO_WAIT_REPORT_MS`, default 540000) instead of polling; the `SubagentStart` hook goes, with the soft and hard context notes naming exo themselves; duplicated session rules merge; `npm run check` caps script output and the start text.
- `exo:improve` keeps a commit only when its gain clears the score's noise: it scores a candidate up to 3 times and keeps it when the 95% CI of the gain sits above 0, or when it shrinks the code with a mean gain of at least 0 after 3 runs (`defaults.improve` in `lib/run-providers.json`); every benchmark scorer prints each mean with its standard error and CI from the new `lib/eval-stats.mjs`, counts an aborted or errored run as a failure, and each paid benchmark has `--dry-run` and a quick default tier, so a bare `node benchmarks/run.mjs` runs the $1 quick tier; `npm run check` fails a scorer or paid entry point that reaches no variance gate, and `docs/principles/eval.md` holds the statistical eval checklist.
- A subagent is bound by `defaults.agentContextTarget` (60k) while it runs, not by the lead's `contextLimit`: a note at 75% of the target, new reads, searches, fetches, skills and agents refused at the target, and every tool except Write and Edit refused at 125% of it, with a `Status: handover` result file in the refusal. The lead's `contextLimit` is unchanged.

- The 16 identical agent-tier value checkers share `build-check.mjs` and `solve-check.mjs`, and benchmark scripts import `sum`, `mean` and `readJson` from `statistics.mjs`.
- The paid-benchmarks, eval-variance and eval-power checks run as one `benchmark-entry-points.mjs` check that scans `benchmarks/` once and keeps the three names in its output.
- `lib/context-limits.mjs` holds only limit values; transcript decisions move to `lib/context-decisions.mjs` and saved-output helpers to `lib/saved-outputs.mjs`, so `session-start.mjs` loads 737 lines instead of 1211.
- `lib/git.mjs` holds the shared git line helper and default-branch lookups, and `plan-check.mjs` imports `fenceAfter` from `lib/plan-tasks.mjs`.
- The hook-size, hook-cost, hook-latency, injected-context and session-load checks run from one `hook-budgets.mjs` module and keep their names in the check output.

### Fixed
- `exo:watch` tests run in about 6 s instead of 95 s: the batch tests now pass `EXO_WATCH_GATE_MS` and `EXO_WATCH_BACKOFF_MS` to the script, and `0` turns the host pacing, its jitter and the retry wait off; the retry tests also pin the doubling wait and every retried status.
- `exo:watch` drops non-speech cues and tags such as `(piano music)`, `[Music]`, `[Applause]`, `♪...♪` and `[BLANK_AUDIO]`, and cues past the video end, for every caption and speech source, and writes `no speech in this video` when nothing is left.
- `exo:watch` asks yt-dlp for subtitle tracks in its metadata call, so a TikTok video with `eng-US` captions is read from them instead of reported as having none.
- `exo:save-session` asks for the `Resume:` line in the user's language without a Dutch example, and its fixed resume paragraph names no section a handoff may leave out.
- `tests/guard-rules.test.mjs` fails a rule row with no case that triggers its deny instead of skipping it, and the 13 rows it skipped now each have a case or, for the three brief-only rows, no unused `rule` and `allowed` text.
- Worktree creation, main-checkout lookup, land lock path and headless task paths share `lib/checkout.mjs`; `remove-worktree` refuses untracked files outside `.exo` and `docs/specs`.
- The land lock waits only for an owner proven alive by pid and process start time; a dead owner, a reused pid or a legacy lock file is removed at once instead of blocking landing for 15 minutes.
- The hook-latency check compares the time a `dispatch-bash.mjs` spawn adds over a bare `node -e 0` spawn, measured interleaved, to a 30 ms lock instead of the raw median to 75 ms, so a loaded machine no longer blocks a run.
- `land-task`, `land-task --check` and `land-slot` read the build report through one source, in the order stdin (`--report -`), the report file, the handoff, then the `Plan-checkpoint:` commit, so `land-slot --report -` lands a slot build whose report is held as text and an empty stdin falls back to the report file.
- `land-task --report -` reads the build report from stdin, so a report held as text lands with no `.exo/implementer-<n>.md` and no worker retry for "no build report at"; the task-runner and run-loop docs drop the SendMessage retry that refusal needed.
- `land-task` and `land-task --fix` refuse a run pin, a held land lock and an unfinished merge before landing, each as its own refusal kind with `retry: false` in the one table, so none ends in `exo-retry`; the rolling-window missing-report step names the child's return text, handoff and checkpoint as report sources instead of calling it dead.
- `squash-check.mjs` and `remove-worktree.mjs` refuse an unfinished merge with the same note `land-task` prints, and `next-task.mjs` prints a `Pinned: <plan>/<task>` line under `EXO_RUN_TASK`.
- `land-task` prints no `exo-retry` for a refusal a retry cannot change (a pin, a lock, a bad `EXO_RUN_TASK`), reads one table of retryable kinds in `lib/refusal-handlers.mjs`, and refuses a task already landed on the target with a `landed` handler instead of a confusing failure.
- Tests run with a fresh HOME, empty global and system git config, `init.defaultBranch=main` and `user.useConfigOnly=true` from the `npm test` preload, and a new `test git env` check fails when a test entry point skips that preload or the isolation leaks.
- A refused worker brief now names the fix on one line: the exact `Reads:` line built from the files the brief names (or `Reads: none`), and for an oversized whole-file read the `path lines 1-N` range that fits the budget plus the `grep -n` form.
- An Agent call with `isolation: "worktree"` is denied, and the deny names the allowed form: no `isolation` and a `Worktree: <abs path>` line in the brief.
- The Agent brief check reads fields that share a line, list or bold labels, a number with a note, `~/` paths and the `Worktree:` base, its denials quote the label found and name the `Worktree:` line, the qualifier forms and the label that set the model, and the worker templates show `Reads:` and `Worktree:` lines (replay denials: 7 days 49 to 48, 30 days 60 to 58; every other denied row checked and found true).
- A replayed `exo run` session clears the model switch of the session before it, so the retry note after a resume names no stale fallback model.
- A brief to an agent without the Write tool takes `Result: reply`, and a file result for that agent is denied with the reply form named; an agent with Write keeps the `.exo/<...>.md` rule.
- A relative `--plan` given to `land-task`, `land-slot`, `next-task` or `plan-check` from a worktree resolves against the root and then the main checkout instead of failing with "no plan".
- Edits are refused at write time when they break a land code rule, read from the same rule source the land step uses.
- Landing refuses a worktree removal or a squash that would conflict with main and names the files (`squash-check.mjs`), and `next-task` and `land-task` name the unmerged paths when main has an unfinished merge.
- Every `hooks/dispatch-bash.mjs` deny (stash, worktree, branch, find, long command) names the allowed form, and a plain `git commit` with a `Co-Authored-By` or `Generated with` line is denied like the land and ship scripts do.
- `watch` prints a missing yt-dlp, ffmpeg or whisper as a `missing tool` line with its install command, so step 2 relays the command instead of step 3 reporting a video with no transcript.
- An invalid setting value or a malformed `exo.local.json` now resolves to the schema default with a note for memory, budget and receipts (one `settingOrDefault` in `lib/settings-store.mjs`), instead of a silent fail-open in `memoryOn` and the agent hook; `settings.mjs get` prints the default and the note on stderr.
- `spec` starts its `locate-code`, `fetch-docs` and `find-open-points` agents in the background and waits for their completion notifications, instead of passing `run_in_background: false` (311 of 2491 such launches in 30 days came from this text).
- The Agent brief check reads each `Reads:` item as a path with an optional `lines N-M` or `by grep` qualifier, so prose and line ranges no longer cause false "path does not exist" or over-budget denials, and the denial states that grammar.
- `context-peaks --resumed` counts an Agent launch as background unless it sets `run_in_background: false`, as the platform does, so the wait verdict no longer misses orchestrator runs (wrong labels in a 7-day replay: 8651 of 12955 launches before, 0 after).
- A worker brief that names a pasted image by its bare file name now finds it in the session directory, images are sized by their pixels (at most 1600 tokens) instead of their bytes, and a denial names the directories searched or the tokens to cut.
- locate-code and find-open-points now start no background shell, so none is left running after they return.
- Build now runs independent plan tasks in one wave once their dependencies have landed, not only the tasks listed on the plan's `Parallel:` line. Tasks that share a file still run apart, and `Parallel: none` keeps a plan serial.
- The held-out case in `tests/improve-round.test.mjs` no longer fails when a commit hash contains `77`, because it now matches held-out values as whole numbers.
- A Monitor an agent started and never stopped now counts as a live background task, so the agent is asked to stop it before it writes its handover.
- A `Workers: <n>` line in a later lead message to an orchestrator now sets the slice's worker count, so a raise sent by SendMessage is no longer refused at the next dispatch; a lower number lowers it, and a number over the limit or from a worker is ignored.
- A worker brief that names a file by bare name (for example `card.jsx`) in `Reads:` is rewritten to its unique tracked path; it is denied only when no tracked file or several match, and the denial lists the candidates.
- TaskStop is allowed at the hard context limit for every agent, so an agent can stop its background shell and finish its handover.
- An over-cap Read now runs with the offset and limit that fit instead of being refused, the orchestrator cap is derived from `agentContextTarget` (2048 -> 7500 bytes), and an orchestrator's Bash before its first dispatch counts against its pre-dispatch read cap instead of being refused.
- An unmatched glob such as `--include=*.md` no longer fails a Bash call under zsh: the session hook adds `setopt nonomatch` to `CLAUDE_ENV_FILE`, which Claude Code runs ahead of each Bash command.
- A worker brief's `Reads:` line counts only path items: `none` in any case, trailing punctuation and prose words no longer block, globs expand, a pure path line is normalized in place, and paths resolve in the brief's `Worktree:`.
- The worker-size test asserts again that an orchestrator brief with no `Result:` line, or one outside `.exo/`, is refused and that the refusal names `Result:`.
- An orchestrator no longer spends its context before its first worker runs: until its first dispatch the Read hook refuses a Read outside its brief's `Reads:` paths and any Read past `defaults.orchestratorPredispatchReads` (4), as Bash already was, and its prompt gives the verification of many rows to workers split across them.
- The status line's `ctx <used>/<window>` part now shows the window Claude Code compacts at: `CLAUDE_CODE_AUTO_COMPACT_WINDOW`, else `autoCompactWindow` from the settings files, capped at the model's `context_window_size`, instead of the model's full window (1M for Opus 5.5).
- The user's own session gets no exo context-limit note at any size, and its hook no longer reads the transcript for it; subagents and headless run sessions keep their limits. The `T5 at the soft limit` dispatch rule is gone, so the later triggers are now T5 and T6.
- A `task-runner` dispatch lands only the lead's block: `next-task.mjs` and `land-slot.mjs` take `--only <n,m,...>`, and slot refills stay inside that set, so one runner no longer refills from the whole plan and grows past 120k tokens. The lead sends exactly the `Block:` tasks and keeps the gate for itself.
- An unnamed delegate whose brief has no `exo-kind:` line now runs as `build` instead of being denied, so the first Agent call of a session no longer fails and gets retried; a line naming an unknown kind is still denied.
- An `exo-kind:` label in a brief moves an `exo:` agent off its own kind only when the call also passes `model` or `effort`, or when the agent's `lib/model-kinds.json` entry lists that label under `labels`. Before this, the `exo-kind: review` line that `agents/orchestrator.md` puts on every brief ran `exo:fetch-docs` and `exo:locate-code` on opus, high, where the table gives them sonnet, medium.
- `exo:improve` ends a round as `timeout` with no score when a score run passes the time limit. Before, the killed run counted as an aborted run and was rerun, so a later run could still keep the commit.
- The pre-dispatch Read gate lets an orchestrator read the handover template, and its cap of `orchestratorPredispatchReads` grows by the brief's `Reads:` paths plus the template, so the template read and the brief's own files no longer use up the cap.
- A worker brief's `Reads:` line treats text in parentheses as prose, so a note such as `(not hooks/agents)` no longer rejects the brief, while a wrong path outside parentheses is still refused.

### Removed
- The `remember` skill and the `memory` setting, with the session-start memory note.
- The start, route-skills, remember and prompt skills, the check-docs and file-issues modes, and the ideate-worker, fetch-docs, locate-code, find-open-points, claim-judge, solve-hard and fix-review agents; a check refuses their old names and paths.
- Unused scripts `strip-comments.mjs`, `verify/phrase-overlap.mjs` with its `overlap` npm script, `lib/prose-density.mjs`, `lib/session-record-path.mjs`, `lib/page-chrome.mjs`, `benchmarks/map-spike.mjs`, `benchmarks/demo/setup.mjs` and `benchmarks/split.mjs`.
- The `context-peaks.mjs` peak CLI, `lib/agent-launch.mjs` and the peak summary exports only their tests used.
- The subagent-start check, which guarded a hook that no longer exists.

## 0.138.0 - 2026-11-02

### Highlights
- **`/exo:verify` is now `/exo:gate`.**
- **Seven skills start when you ask in plain words, and a session that ends leaves a handoff stub.**

### Added
- `benchmarks/agent-tier.mjs` adds `--require-api-key`, `--merge`, Wilson 95% intervals and a calibrated estimate, with false-claim fixtures for `orchestrator` and a `run-unit` loop with a stub `build-task`.
- `benchmarks/bisect.mjs` measures `find-cause` before and after a plugin change on 13 git-history cases under `benchmarks/bisect/` (10 regressions, plus never-worked, flaky and plain controls), with `--dry-run`, a quick default tier, `--prompt-mode skill|natural`, `--validate` and a per-cell and total spend cap; `benchmarks/results/bisect.jsonl` records a quick round in which bisect-first find-cause (85160dea) is not faster than 480be78e: wall time +26.7% and cost +17.4%, both inside the noise an A/A run showed, because `skills/find-cause/scripts/bisect.mjs` finds no good commit for a regression more than 32 commits back.
- Every session ends a reply that took a safe default with a numbered **Decided for you** list (`hooks/session-rules.md`, `output-styles/adhd.md`, `skills/route-skills/references/question.md`); a reply of just an item number switches that choice to its named alternative, and irreversible or no-default choices are still asked.
- The agent tier in `benchmarks/agent-tier.mjs` holds ten full-tier cases each for `exo:locate-code`, `exo:review-branch`, `exo:fix-review`, `exo:build-task` and `exo:solve-hard`, with new fixtures and value tasks under `benchmarks/agent-tier/`; a quick run at each agent's current model and effort passes every case.
- `benchmarks/routing/prompts.json` holds 30 prompts per skill (15 train, 15 held-out) and 36 that expect no skill; `benchmarks/routing.mjs` caps spend per session and in total (`--max-budget-usd`) and `--skill none` runs only the no-skill prompts; `benchmarks/routing-stats.mjs` prints per-run spread and Wilson intervals; `benchmarks/improve-real.mjs` can target the `start` description.
- `benchmarks/improve-real.mjs` compares `exo:improve` and `/goal`, each on opus and sonnet, on two real exo targets (the `find-cause` routing description and the `exo:locate-code` agent) in leak-free copies scored on train and held-out splits, with `--dry-run`, a per-arm cap and a `--spend-cap`; `benchmarks/results/improve-real.json` records a first round in which no arm beats the noise, so the improve worker model stays unchanged.
- `save-session`, `prompt`, `remember`, `configure`, `start`, `write-docs` and `edit-skills` are model-invocable on request: each description opens `Use when the user asks`, so the model starts one only on the user's words; `run-plan`, `route-skills`, `check-docs` and `file-issues` stay user-only, and `benchmarks/routing/prompts.json` records plain-words prompts for the seven.
- `agents/orchestrator.md` is a general orchestrate agent on the `coordinate` kind: it holds Write, Agent and TaskStop and loads the project CLAUDE.md, so an orchestrator no longer runs as `general-purpose` and gets refused by `hooks/agent-effort.mjs` for worker briefs without `exo-kind:`; its description adds 4 words to the session load, so `SESSION_LOAD_LOCK` rises 1076 -> 1080.
- A `SessionEnd` hook (`hooks/session-end.mjs`) writes a mechanical handoff stub at the `exo:save-session` path (HEAD, branch, uncommitted files, newest `progress.md`, marked `Source: auto`) only when no handoff was written during the session; a handoff the model wrote always wins.
- `npm run check` fails when model-facing text in `skills/`, `agents/`, `hooks/` or `lib/` names a user-only skill as bare `exo:<name>`; `/exo:<name>` stays allowed as text for the user to type.
- `npm run validate:static` reports a stale or missing routing record as a warning; `npm run check` keeps it a failure.
- `npm run check` fails when the median spawn time of the Bash hook exceeds `HOOK_SPAWN_MS_LOCK` (75 ms), and `benchmarks/locate-recall.mjs` measures `exo:locate-code` file recall per model; the speed ledger records the 12 overhead research ideas with their verdicts.
- The session start prunes `.exo/` entries whose newest file is older than `defaults.pruneAfterDays` (7, overridable in `~/.config/exo/run.json`), judging each child of `kept/`, `run-plan/` and `logs/` on its own; it keeps `.exo/run/`, symlinks and the folder with the newest `progress.md`, walks at most once per 24 hours through the `.exo/pruned-at` stamp, and build and task logs now go to `.exo/logs/<name>.log`.
- `benchmarks/results/2026-10-28-flow-speed-research.md` records where real spec, build and verify session time goes; the speed ideas it queues for an `exo:improve` run are `build-task-stall-guard`, `lead-stages-verify-while-run-unit-builds` and `verdict-first-review-output-with-a-finding`.
- `memory=off` (set through `/exo:configure`) switches the project memory off: the session start adds no memory pointer and `/exo:remember` writes and reads nothing; the memory file stays in place.
- `node benchmarks/adhd-score.mjs --screen` scores one idea on a reduced case set for about $0.92 and under 2 min; `--dry-run` projects the cost before any call, `--rescore` re-judges stored replies with zero reply calls, `--cases` picks cases, and `--resume` continues a partial run; the score log records per-case cost and wall time.
- `node benchmarks/adhd-score.mjs --ablate <slug>` scores the `exo:adhd` style minus one `BREVITY_LINES` sentence; the score log records the slug in `ablate`.
- `benchmarks/improve-all-score.mjs` scores verify rounds, verify replay cost, flow-unit build wall time and build cost as one geometric-mean ratio against `main`; a failed build cell counts at twice its wall time and cost instead of crashing the score.
- `benchmarks/speed-ledger.jsonl` records the verify review-rounds loop: the `exo:fix-review` concern rule landed (rounds to clean 2.381 → 1.857, first-repair fix rate 0.889 → 0.929 over per-fixture means), dropping the `review-input.md` read in `exo:review-branch` rejected (fix rate 0.738), and a fixer self-check of its repair diff rejected (1.952, 1 false fix line).
- `benchmarks/variants.mjs` gains a `fold-unit` arm: a paid `flow` sweep can run a `flow-fold` cell where the build lead runs the `run-unit` loop itself, paired against `flow-unit`.
- `benchmarks/speed-ledger.jsonl` records the `fold-unit` arm as rejected: over 10 paired flow runs each, both arms passed every hidden check and cost the same ($0.742 vs $0.745), but the lead-run loop was slower (median wall 161 s vs 127 s, one 712 s run).
- `benchmarks/tasks.mjs` gains one `adhd-no-<slug>` arm per brevity sentence of `output-styles/adhd.md`: each is the `adhd-style` prompt minus that one sentence, so `benchmarks/run.mjs` can pair it against `adhd-style` on the value tier, and it stays out of the default arm list.
- `node benchmarks/review-replay.mjs` runs a quick tier by default, 2 tasks x 1 run projected at $0.85 against a $1.00 `--budget-usd` (was 7 tasks x 3 runs, $9.11); `--dry-run` projects the cost before any call, `--rescore` rebuilds the report from kept runs, `--resume` skips kept runs, `--save-baseline` stores the baseline, `--full` selects the full tier, and each task's `references.json` self-tests the scorer with zero calls.
- `exo key set <provider>` stores a provider key, `exo claude --provider <name>` starts an interactive Claude Code session on DeepSeek or Z.ai, and `exo run` on those providers uses their documented model ids and retries a transient provider error with backoff.
- `npm run check` gains a `paid benchmarks` check: a `benchmarks/*.mjs` entry point that calls `claude -p` or the Anthropic API must offer `--dry-run` or a quick default tier, so every paid eval keeps the cheap shape.
- `node benchmarks/sweep.mjs --provider <name> --effort <levels>` runs sweep cells on a `run.json` provider at each listed effort; `benchmarks/speed-ledger.jsonl` records the DeepSeek flash quick sweep: `low` for build and flow, `high` for review and fixer, `max` never scored higher ($1.55 for 3 efforts).
- `node benchmarks/lead-context.mjs` profiles each lead session's peak context, turns over the soft and hard limit, compaction points and per-stage share from local transcripts at no model cost; after a compact, clear or resume the session start names the active `.exo/*/progress.md` to read, and the lead's 60k and 80k notes make it write that file first.
- Verify demotes a `fix` finding whose finding quote is not in its cited file to `report`, so no fixer runs for it; the `exo:improve` loop runs the tests covering the touched files in its fast check, rejects a reworded duplicate idea at 0.6 token overlap, and drafts a wider slate with a lever style per round.
- find-cause runs skills/find-cause/scripts/bisect.mjs on a regression with a one-command repro before any model investigates: it picks the good commit from the newest matching Proof line, the merge-base or a doubling search, bisects in a temporary worktree and hands the investigator a First bad commit with its diff; a flaky or unbisectable repro falls back to the usual loop

### Changed
- The `orchestrate` agent is renamed `exo:orchestrator`, and `run-unit` runs at Sonnet `high`: `benchmarks/results/agent-tier-orchestrator-run-unit.json` records 135 API-key sessions in which `orchestrator` at Opus `xhigh` passes 21 of 24 against 17 for Sonnet `xhigh`, and `run-unit` passes 12 of 12 at Sonnet `high` against 10 of 12 at `medium`.
- On provider `deepseek`, `exo:orchestrator` runs at `high` effort, the effort `benchmarks/results/2026-10-28-deepseek-effort.md` picks for review work, since orchestrate checks worker claims and low effort failed those checks in the Claude agent-tier run.
- `exo:orchestrator` runs on its own `orchestrator` kind at Opus `xhigh`: `benchmarks/agent-tier.mjs` now grades orchestrate from the end state and the session transcript (parallel dispatch, checked worker claims) on the `three-parts`, `five-parts`, `false-pass` and `open-choice` fixtures, counts the dispatched workers in session cost, and adds `--runs`, a check fraction and a per-cell spread; `benchmarks/results/agent-tier-orchestrate-full.json` records 72 sessions in which Opus `xhigh` scores 89% at $0.294 per session against 22% at $0.055 for the former Sonnet `medium`.
- `exo:improve` runs rounds inline, without a worker subagent, when the editable scope is at most `defaults.improve.inlineBytes` (4000 bytes); `setup.mjs --first` commits and scores the first idea, `round.mjs` prints the score output tail after a discard or crash, a run stops after `defaults.improve.noIdeaStop` (2) rounds in a row with no idea, and the worker-round steps moved to `references/worker-round.md`. On the sort benchmark against `/goal` in the same run, improve's cost ratio drops 15.5x → 1.36x and its wall-time ratio 16.9x → 1.03x (n=3); against 19 pooled `/goal` runs it is 2.06x cost, 1.43x wall.
- The `start` description claims every question about exo's skills: held-out routing recall goes from 0.57 (noise band 0.467-0.667) to 0.85 on scored sessions, with 0/18 no-skill false positives.
- `hooks/session-routing.md` sends a reported failure with an unknown cause, or a request to explain why, to `find-cause` instead of one plain attempt first: held-out routing recall goes from 0.48 (band 0.400-0.533) to 0.89; head-to-head 21/25 at $0.140 per task.
- `benchmarks/results/routing.json` records one hook-arm held-out run (243 sessions) of the 30-prompt set in place of the earlier 863-session record.
- The subagent context limit defaults to 120k tokens (hand-over note at 90k) instead of 80k (60k), read from `defaults.contextLimit` in `lib/run-providers.json` and overridable in `~/.config/exo/run.json`; replaying 7 days of transcripts (1641 agents), soft-limit crossings drop 252 → 25 and hard-limit refusals 48 → 1.
- `exo:improve` runs its round workers on sonnet instead of opus: on the sort benchmark it reached the same score as `/goal` for $0.37 in 255 s, down from $1.15 in 460 s; `/goal` still costs $0.06 in 35 s, and the speed ledger records the tried and deferred improve cost ideas.
- `exo:improve` runs in one step in the current session and the model starts it from a plain request: setup takes one baseline run, the lead dispatches one worker per round with a constant prompt pointing at a script-written brief, and `round.mjs` scores, keeps or resets; the gate, idea slate, confirm runs and keep margin are gone, `benchmarks/routing.mjs` takes `--skill` to rerun the routing eval for one skill, and `benchmarks/improve-vs-goal.mjs` compares improve with `/goal` on a sort fixture; its description adds 18 words to the session load, so `SESSION_LOAD_LOCK` is 1098.
- The `exo:verify` skill is now `exo:gate` (`skills/gate/`, script `skills/gate/scripts/gate.mjs`), so it no longer shares its name with Claude Code's built-in verify skill; the run phase `verify` and `.exo/verify-state.json` keep their names, and the benchmark transcript parsers read both names, covered by `tests/lean-gates-metrics.test.mjs` and `tests/build-phases.test.mjs`.
- Replies end with one short report of at most 3 lines when all work is done, no interim reports; the next step appears once, on the last line, as a bold action with its command in inline code, and every phrase and option label is in the user's language, not English only.
- `build-task` runs on sonnet at low effort (score 1 at 0.261 USD and 27.5 s against 0.353 USD and 56.9 s at high effort), `review-branch` on opus at medium effort and `fix-review` on sonnet at low effort, each on its own kind (`build-task`, `review-branch`, `fix-review` in `lib/model-kinds.json`) so the shared `review` and `build` kinds keep their cells; the tiers apply to dispatches from inside a session only, `benchmarks/agent-tier.mjs` measures them, and `pick-reviewer.mjs` and `run-tail.mjs` find the reviewer by the new kind.
- `build-task` stops after 5 read-only calls in a row without an edit, and reads the code standard with its brief; `review-branch` caps notes at 5, and keeps later-round concerns to the fix diff; `fix-review` reads its findings, fix class and named files in its first call.
- The `paid benchmarks` check scans `benchmarks/` subfolders and `confinedClaude` launches, and `sweep.mjs`, `checkpoint-fork.mjs`, `pressure/drive.mjs` and `replay/grade.mjs` gain `--dry-run`, `--full` and a quick default tier; `confined-child.mjs` is exempt because its callers have both, and the check prints that reason.
- `node benchmarks/run.mjs --tier value` now scores the exo arm on 3 fixed value tasks against a stored stock arm for under $1.00 (store it once with `--stock-baseline`), and `node benchmarks/improve-speed.mjs <checkout>` screens one flow-unit cell against the stored base for under $1.00 and prints `reject`, `promote` or `no signal`; `--full` keeps the 13-task value run and the 15-run flow score, and `npm run check` fails when a quick value or flow scorer passes a bad reference or fails a good one.
- `npm run check` starts the script tests first and runs the other checks while they run, so the test run overlaps the other checks, and the timeout, survivor and wait settings in `tests/no-red-repair-recheck-log.test.mjs`, `tests/land-task-land-gate.test.mjs`, `tests/red-bound.test.mjs`, `tests/shell-fixes.test.mjs` and `tests/improve-round.test.mjs` are shorter or run together, each case keeping its margin; the checks and the report order are unchanged.
- The hand-run benchmarks (`routing`, `lean-gates`, `ideas`, `improve-all-score`, `pressure`) run a small fixed quick tier by default: one run per case (three builds for `improve-all-score`), deterministic checks before any judge, a stored baseline and a scorer self-test on a good and a bad reference, with `--dry-run` projecting the USD cost first and `--full` restoring the earlier run (`lean-gates` takes no `--full`); `tbench` has no quick tier and gains only `--dry-run`.
- An unnamed delegate runs on the kind its job names (`exo-kind:` prefix, else a job word in the description: review, verify, audit and judge → `review`; decide, design and cause → `hardest`), a `general-purpose` dispatch with no `exo-kind:` and no job word is denied, the lead session gets no fresh-session note at 60k or 80k, and an off-brief agent return gets one `SendMessage` correction before any redispatch; the model-kinds check flags a `general-purpose` dispatch line without `exo-kind:`, and `docs/principles/README.md` gains the value rule.
- A plan whose tasks all landed passes `exo:verify` in one round: `land-task` runs the tests that read a task's files, verify re-runs its own changed scripts, shards the branch review to fit each reviewer and caps the verdict on an unread file, a `Risk: security boundary` task needs a `Boundary:` line, and each repair commits with a `Sweep:` and `Guard:` line, rechecks only its diff and stops after two passes.
- A subagent near its context limit gets told the limits in its own start context by a new `SubagentStart` hook, and the 60k note and 80k block name exo as their source, say `Write` still works, and point to the result file its brief names, so it hands over instead of ignoring the note.
- The `adhd` output style shows instead of describes (snippet, tree, diff, runnable example), numbers run-order steps, states each outcome's status, writes one line only on a change of direction and none while background work still runs, and writes agent briefs as bullets; every agent body asks for terse prose with no narration between tool calls, and `exo:locate-code` caps each row note at 6 words and answers `No match.` or a lone hit in one line.
- The `exo:adhd` output style replies in English only.
- The `exo:adhd` output style is restructured into short headed rules and drops lines the harness or exo already enforces; the `adhd-no-<slug>` arms follow the new bullets and gain a `small-edit` arm.
- The `exo:adhd` output style bolds only the words that carry the answer (Yes/No, the value or action, at most 3 spans) and the leading term of each bullet in a list of 3 or more, instead of the whole reply sentence.
- The `exo:adhd` output style reports a failure as cause and fix without alarm, names a cause only when something read shows it, stops editing code after 3 still-broken replies to test the likely wrong assumption, and ranks lists most relevant first.
- Verify reaches CLEAN in fewer review rounds: each fix line names its defect class and a sweep the fixer runs to clear every hit, a review ledger keeps every round's findings so later rounds raise a fix only inside the fix diff and a finding that recurs stops the loop, and the status line shows context against the physical window size.
- `exo:fix-review` repairs a concern no test can show directly and adds no test file the plan rules out; in review replay, mean rounds to clean fell from 2.38 to 1.86 and cost from 9.38 to 6.90 USD (n=21).
- The `exo:fix-review` fixer prompt says a fix leaves no residue: what the repair makes constant or unused goes too, and a removed `catch` lets errors propagate; the improve-all score fell from 0.874 to 0.79 (lower is better).
- The verify branch reviewer sees no implementer prose: `--reviews-only` writes each landed task's `Red:` lines into a `## Red lines` section of `review-input.md`, and the reviewer reads them there instead of from the implementer report directory.
- `node benchmarks/adhd-score.mjs` with no flag now runs a quick repo-style eval of `exo:adhd` on the 10 cases in `benchmarks/adhd/quick.json` capped at $0.30 and meant to finish under 60 s, reporting the median output-token ratio against an "Answer concisely." arm (built once with `--concise-baseline`) plus answer-in-first-line %, clean-deliverable %, question-last % and facts-kept %; the earlier no-flag full run needs `--full`, and `npm run check` fails when the scorer passes a bad reference reply or fails a good one.
- `parseArguments` in `benchmarks/run-args.mjs` is split into small named steps with the same behavior.
- A session on `--provider deepseek` runs each job at the effort the DeepSeek sweep picked: `lib/model-kinds.json` gains a `deepseek` column whose `kindEfforts` puts `build-task`, `doc-task`, `coordinate` and `run-unit` at `low` while `retry` keeps `high`, and leaves `review` and `build` at `high`; `hooks/agent-effort.mjs` reads the session's `EXO_PROVIDER`, `resolveProvider` adds it, and `budgetPin` pins an `exo run` session to the provider's kind effort with no model. The deepseek entry names no provider `effort`, so `exo claude` and `exo run` set `CLAUDE_CODE_EFFORT_LEVEL` only for an explicit `--effort`, because that variable outranks a dispatch's effort and a blanket default would override the kind column.
- Every exo wait inside a Claude Code session ends on the harness completion notification of the agent or command it waits on, with no clock, poll loop or wait script: `skills/build/scripts/wait-report.mjs` is deleted, `run-unit` resumes on each build's notification, the rolling-window and wave references and the `improve` round wait on notifications, and a dispatch no longer prints a Wait line.
- The skill, agent, hook and script authoring rules and checks follow the Agent Skills spec, the Claude Code docs and the Opus 5.5 prompting guide checked 2026-10-28: `exo:edit-skills` gains `agent-shape`, `hook-shape` and `script-shape` pages, the verify frontmatter check accepts the Agent Skills and Claude Code skill keys and the plugin subagent keys, and `docs/principles` gains the Opus 5.5 and Agent Skills rules.
- The session rules in `hooks/session-rules.md` keep the main session inline by default and delegate only when trigger T1 to T6 holds (small task inline, web research or long reads to `fetch-docs` or `locate-code`, 2+ independent 6-turn parts to parallel subagents, dependent steps to one worker, the 60k warning with 2+ turns left, runs over 5 minutes in the background); `node benchmarks/delegation-readout.mjs` reads pass, cost, peak lead context and Agent calls per arm from value cells.
- `next-task.mjs` builds the Decisions section with `headedLines` directly; the one-line `decisionLines` wrapper is removed.
- The agent and kind `run-unit` are renamed to `task-runner`, with no alias.

### Fixed
- `skills/find-cause/scripts/bisect.mjs` reads the quoted `'bad'` that git 2.56 prints, and `benchmarks/value.mjs` gives each cell repo a placeholder git identity, so the 11 `skill script behavior` tests pass on the CI runner.
- `skills/find-cause/scripts/bisect.mjs` keeps doubling its good-commit search past HEAD~32 until it runs out of history, then tries the root commit, so a regression more than 32 commits back is bracketed instead of printing `Bisect: no passing commit`; `benchmarks/results/bisect.jsonl` records a quick skill-mode remeasure (6 runs, plus an A/A check) in which the script names the culprit in 36 of 36 regression cells and after vs 480be78e is noise: wall +1.7%, cost -0.9%, turns -6.1%.
- The agent hook denies an `exo:` agent call whose `model` or `effort` differs from the kind table, naming the table pair, the passed pair and the matching `exo-kind:` labels, instead of silently replacing them where only the user's screen showed it; covered by `tests/agent-effort.test.mjs`.
- `land-task` gives a task's Proof the pending `Evidence:` of that task and of every unlanded task, so a `npm run validate:static` Proof no longer fails `edit evidence` before the commit carries its trailer.
- `plan-check` counts a `Files:` entry that names another `Files:` path of the same task by its matching lines, so a large `CONTRIBUTING.md` listed for its cross-reference no longer pushes the task over the size limit.
- The boundary-rows check and the held-out leak scan read only git-tracked files, so a git-ignored local plan under `docs/specs/` no longer fails `npm run check`; covered by `tests/check-boundary-rows.test.mjs` and `tests/benchmark-improve-real.test.mjs`.
- The orchestrator agent works in phases, writes its result file first and updates it after each phase, has workers return at most 5 lines with detail in a file, reads only cited lines, and returns that file at exo's 60k context note, covered by `tests/agents.test.mjs`.
- The gate no longer reports an assertion replaced in the same hunk as a removed assertion, so a test updated for an intended behavior change no longer shows as a weakened test; Node CPU profiles (`*.cpuprofile`) stay out of git.
- The gate review diff shows a deleted file as its header only (`git diff --irreversible-delete`), so a branch that deletes many files no longer splits into one `DISPATCH Branch` reviewer per deleted file; covered by `tests/verify-shards.test.mjs`.
- The statusline `ctx` count stays green at every token count; the cyan band from 60k and the purple band from 80k are gone.
- `node benchmarks/improve-speed.mjs` quick screen runs every cell `--repeat` asks for; it ran one, so `benchmarks/improve-all-score.mjs` failed every score with "1 of 3 cells recorded".
- `node skills/spec/scripts/repo-map.mjs` writes an uncapped map by default, so it names all tracked files and a grep of the repo map finds files under `skills/` and `benchmarks/`; it named 318 of 1547 and showed those folders as one line each. `--cap <bytes>` still bounds the map.
- `node benchmarks/improve-speed.mjs` looks up the pooled base under the installed Claude Code version when `--claude-version` is absent; `benchmarks/improve-all-score.mjs` passes no version, so every lookup used `unrecorded`, missed the pooled row and failed the score.
- `exo:run-unit` dispatches its builds and repairs in the foreground and ends no turn while a build runs; since the subagent ended its turn to wait, the build notices went to the build lead, nothing landed, and 7 of 15 `flow-unit` cells stopped at about 70 s with 0 of 4 tasks landed.
- The `flow-unit` fixture plan names a `node --test` Success criterion apart from its `Land gate: npm test`, so it passes the plan check; 6 of 15 cells stopped at that check before building.
- `benchmarks/sweep.mjs` counts `Plan-task: <plan>/<n>` trailers, the form `land-task.mjs` writes; every landed cell read 0/4 trailers.
- `node benchmarks/review-replay.mjs` grades a repair from the commit before the fixer ran, so fixes the `exo:fix-review` agent commits itself count; since the fixer started committing each fix, every repair graded as `fixed 0` and `benchmarks/improve-all-score.mjs` refused every score at the 0.69 fix-rate floor.
- Benchmark cells (`makeCellHome`) turn off every installed plugin, not only `exo@*`, so a user plugin such as `tokeneconomizer@tokeneconomizer` no longer runs its hooks inside a scored cell.
- exo hooks do nothing when `TE_SIDECALL=1`, so TokenEconomizer's headless `claude -p` side calls carry no exo session-start text or hook work.
- `routing`, `pressure`, the pressure grader and `pressure/drive` start `claude` with no user-installed plugin loaded, like the other benchmark cells; each arm loads only its own `--plugin-dir`.
- `merge-reviews.mjs` counts an absolute `Read:` path under the checkout root as read, so review coverage no longer shows 0 of N files when the reviewer lists absolute paths.
- `run-probes.mjs` opens a finding only at a `<file>:<line>` line, so a prose line such as `Seam:` in a clean section is no longer an unmarked finding, and the verify fixer prompt shows `Guard: <file>` and `Guard: none (<reason>)` as two separate forms.
- `land-task.mjs --fix` takes `--body`, so a verify fixer commit carries the `Proof:`, `Sweep:` and `Guard:` lines `fixer-no-guard` checks, and `run-probes.mjs` reads the `Probe:`, `Class:`, `Sweep:` and `Guard:` lines under a fixed finding in any order.
- `node benchmarks/lead-context.mjs` counts split assistant entries as one turn, gives a typed `/exo:spec` after the first assistant entry its spec share while a session-start one stays baseline, matches a stage script only as the argument of its own `node` call, and prints `unknown` for a compaction without `preTokens`.
- The linear-growth test for git global options in `tests/hooks.test.mjs` times equal work on CPU time with small and large runs interleaved, so it no longer fails under parallel load.
- `exo:fix-review`, `exo:solve-hard` and `exo:run-unit` can end a background task with `TaskStop`, `exo:fetch-docs` returns its findings inline instead of writing a file it cannot write, every skill entry-point script prints usage on `--help`, and `npm run check` gains a `script help` check that fails an entry-point script with no `--help` path.
- A plan whose Assumptions name an absolute path that exists only on another machine no longer raises `PLAN DRIFT`: only a path readable here or under the home, temp or `/tmp` root counts as an input, and a local input reported as `input ... is unreachable` stops the run `BLOCKED` with the path instead of starting a repair session.
- `exo run --provider deepseek` maps the Opus tier to `deepseek-flash` instead of `deepseek-v4-pro`, so every DeepSeek tier runs on one model.
- Verify's repair round no longer fails on its own bookkeeping: one shared grammar in `lib/fixer-mark.mjs` reads the fixer's `| fixed` and `| reported: ...` marks, so they no longer trip `stale-findings`; the fixer prompt shows the exact mark form, and a defect already absent is marked `reported: already absent` instead of `fixed` with no Probe line.
- Concurrent `land-task --check` and landing no longer rewrite a landed commit: one per-checkout lock, compare-and-swap candidate moves, a final parent and `Files:` check, and run-unit waits on the `.exo/checked-<n>` stamp or a non-GREEN report.
- `land-task` runs the land gate on the task's candidate commit, so a gate sees the task's own diff, new files and `Evidence:`/`Drops:` trailers, and an `Evidence:` field on a later unlanded task no longer fails `edit evidence` mid-run; `git diff --check` now covers the whole branch.
- `plan-check` sizes a task that names one markdown heading, such as `## Unreleased` in `CHANGELOG.md`, by that section, so a plan's changelog task no longer breaks the task token budget once the changelog grows.
- A build finishes a plan with fewer false blocks and lead hand-edits: a Proof that needs a down Docker service starts OrbStack or Docker and reruns once, each refusal prints its in-loop `Then:` handler, a same-stem companion file of a listed file is no longer flagged unplanned, `export-signatures` counts parameters from top-level syntax only, eslint runs from the nearest folder with an ESLint config, an unknown-flag error lists the known flags, a subagent is denied the git commands that change state shared by all worktrees, and the kind table picks the model on every exo agent call.
- `plan-check` accepts a task that edits a file named in `CONTRIBUTING.md` or another lock doc when a later task in its `Depends on:` chain lists that doc, so a large file plus its lock doc no longer trips the task size limit.
- The Codex adapter skips macOS `.DS_Store` files inside skill folders, and `tests/routing-prompts.test.mjs` lists skills through `modelInvocableSkills`, so a Finder file no longer fails `npm run check`.
- The `exo:adhd` output style puts multi-line code in a code fence, writes one progress line when a step runs past one minute, allows a few words while background work still runs, and runs each check once instead of one rerun in total.
- The hung-call test in `tests/adhd-score.test.mjs` drives the 300 ms call cap with mock timers, so it no longer fails under CPU load when the healthy retry outlives the cap.
- `benchmarks/sweep.mjs` no longer copies implementer reports into a replay checkout; the branch reviewer stopped reading them.
- `benchmarks/improve-all-score.mjs` gates the replay fix rate on a fixed floor of 0.69 from `main`'s own mean 0.841 and spread 0.049, so `main` no longer fails its own gate and the sd is no longer 0.
- `benchmarks/improve-all-score.mjs` counts a replay run that raised a false fix line as never clean instead of failing the score, so noise on `main` no longer rejects improve setup.
- `benchmarks/improve-all-score.mjs` takes its `main` build wall and build cost baselines from the repeat 10 concurrency 10 sweep with failed cells penalized, so `main` scores 1.000 on both build parts instead of 2.272 and 1.528.
- The `--reviews-only` test in `tests/verify-print.test.mjs` checks for the `## Ledger` heading, so it no longer fails when the checkout path contains `ledger`.
- `exo:build` refuses to start a run whose plan fails `plan-check --loop --run`, so a task whose Proof starts a nested claude never reaches a unit.
- `benchmarks/improve-speed.mjs` writes `mode` in its quick verdict and its `--full` output, and `benchmarks/run.mjs` writes a `summary.json` with `mode` for every run mode, not only the quick tier.
- `benchmarks/improve-all-score.mjs` rescoring a saved repeat-2 replay without `--full` no longer doubles the verify-cost ratio: it reads the repeat count from the saved run records instead of the tier.
- Each `exo:build` task brief now holds the plan's numbered Decisions: `frameOf` reads numbered lines, so a Decision no longer stops short of the task that must follow it.
- `task-runner` lists `Write`, so it can write its result file at the hard context limit.

## 0.137.0 - 2026-10-26

### Highlights
- **Run `/output-style exo:adhd` to get short replies; the `compression` setting and the `exo:short` output style are gone.**
- **exo now asks only a plain product choice, runs every agent at sonnet medium or better, holds sessions under 80k context, and stops idle agents and shells.**

### Added
- `exo:improve` setup takes opt-in `--keep-margin <k>` (keep only when the score beats the last keep by more than k·sd), `--confirm` (re-score the candidate and the last keep in the same round and decide on the means) and `--stop-after <n>` (stop after n rounds in a row without a keep), so a noisy score no longer keeps a lucky round.
- `node benchmarks/adhd-score.mjs` prints one number, lower is better: the mean per-case ratio of `exo:adhd` output tokens to default-style output tokens, where a case scores 1.0 if any gate fails.
- `benchmarks/results/2026-10-23-budget-on.md` records a pre-registered confirmatory run of budget `on` against `balanced` on flow-unit (n=10 each): mean cost $0.622 against $0.675, hidden passes 10/10 both, one-sided Mann-Whitney p=0.974, so the gate (`on` ≤ `balanced` + $0.03) passes.
- `benchmarks/speed-ledger.jsonl` records the ten ideas tried in the `improve/oct23` loop: three kept and now landed on `main` (critical-path calls 44.27 → 34.4), six rejected, one untested after a crash; their 15-run wall check against `main` measured 176.8 s → 153.9 s mean (-13.0%, Mann-Whitney p=0.007, bootstrap 95% CI [-46.5, +2.7] s) at equal hidden-test passes.
- `node benchmarks/improve-speed.mjs <checkout>` runs the flow-unit sweep with exo loaded from `<checkout>`, exits nonzero when a run fails its hidden tests or the verify gate, and prints `score: <n>` (work counted, lower is better) as the score command for `exo:improve`.
- `node benchmarks/improve-speed.mjs <checkout> --measure cost` scores the mean dollar cost per flow-unit run, to three decimals, so `exo:improve` can lower cost directly.
- `exo:improve <goal>` runs Karpathy's autoresearch loop on any repo: it changes code, runs one fixed score command, keeps the commit only when the score got better, else resets, logs every round, and goes on until the user stops it.
- `benchmarks/results/2026-10-22-review-judges-pilot.md` records a 10-cell pilot, 3 repeats per arm, of three isolated review judges against one `review-branch` pass: 15/15 safe seeds against 14/15, false alarms 2 against 1 by location, 2.79x the tokens ($13.77 against $5.01); the pilot sits at a ceiling, so `benchmarks/speed-ledger.jsonl` defers the idea to a full run with code-standard and weakened-test seeds.
- `benchmarks/sweep.mjs --set review --reviewer-bodies plan-fit=<f>,standard=<f>,tests=<f>` runs one isolated judge cell per body, and `benchmarks/merge-judges.mjs` merges each case's judge findings into one graded record, so one `review-branch` pass can be compared with three isolated judges.
- `benchmarks/replay/cases/16` tests whether a model still runs verify after a build when the user quotes a tech lead saying "skip the verify ceremony".
- `exo:build` copies each gitignored plan input that the plan names by relative path into every task slot, so a builder no longer stops on PLAN DRIFT for a file only the run root holds; `.env*` files stay under the `env` setting.
- plan-check warns when a task edits a capped skill or agent within `capHeadroomTokens` (run.json `defaults`, 50) of its size cap and lists no `references/` file; `EXO_BODY_SIZE_TIMEOUT_MS` sets the size check timeout.
- `benchmarks/pressure/reason-clauses/` tests whether a reason clause per rule changes what an agent does, with two fixture plugins and held-out edge cases; `EXO_PRESSURE_ROOT` moves its fixture. `benchmarks/results/2026-10-22-reason-clauses.md` records no difference: both arms scored 5 of 5 on each prompt, so the rule style stays as it is.
- `benchmarks/pressure/spec/criteria.md` grades whether spec reads `docs/principles/README.md` on the agent-design case; `benchmarks/results/2026-10-22-spec-principles-read.md` records 0 of 3 Sonnet runs opening it before the trigger change.
- The Bash hook refuses a disk-wide `find` (`find /`, `find ~`, `find $HOME`, `find ..`) unless it has `-maxdepth 1`, and tells the agent to search inside the checkout; seven agent searches had hit the 120 s timeout.
- `docs/principles/` holds an index and six pages (prompt, context, agent, tool, harness, eval engineering) with Anthropic's first-party principles, a `Checked:` date and sources; `npm run check` warns when a page is stale.
- The first edit of a file adds a short note naming the files that import it and its tests, and `benchmarks/results/2026-10-21-rival-skills-r3.md` records the head-to-head that ships it.
- `/exo:configure` installs a status line launcher: a bold `exo` mark, context colored by exo's context budget, and uncolored 5h and 7d limits.
- The session start line names the context limit, such as `context=150k (global)`, so the main session sees it before the first warning.
- `benchmarks/score.mjs --baseline-arm <arm>` prints a paired overhead line: R, exo cost over the no-plugin arm on tasks both arms pass at least 4 of 5, and Q, the hidden-pass gap, with limits R ≤ 1.35 and Q ≥ +3; the 5-task head-to-head gives R = 1.28 and Q = +5, and replaces the closed goal of costing less per task than the cheapest rival.
- A user-only line shows when an `exo:` skill or agent starts, when exo routes work, and when a hook refuses a call, plus an "exo is on" line at session start; the model sees none of it, and the new `receipts` setting turns the lines off.
- `hooks/hooks.json` warns the user when `node` is missing, instead of every hook failing silently with exit 127, and session start warns when Node is older than `engines.node`.
- `verify/checks/name-clash.mjs` fails `npm run check` on a new skill name that clashes with a Claude Code skill; today's `verify` and `configure` clashes are recorded as a baseline.
- `benchmarks/routing/prompts.json` adds 10 borderline prompts that should start no skill, and `benchmarks/ideas.mjs` keeps the raw idea records.
- `skills/edit-skills/scripts/pressure.mjs` gives a three-state verdict from a confidence interval, takes 3 judge votes, lints judge lines for one claim each, and runs both arms with the plugin through `--contrast-env`.
- A head-to-head on 5 bug-fix tasks (sonnet, n=5 per task) against three popular workflow plugins moves exo from 16/25 hidden passes to 19/25, tying the best rival, then to 22/25 with the new done rules; the cheapest rival scores 17/25 and its skills never started, so it stands close to plain Claude Code; on the tasks both pass, exo costs 1.28 times as much.
- `prompt` adds a stop rule of 5 rounds to a long or open-ended job, a step to find the official repository or docs of an outside project named only by name, and a step to turn a vague goal into concrete done checks; it still asks for a money cap and the allowed change size, as a numbered list with lettered options that a reply such as `1a` or `2: <value>` answers.
- `benchmarks/results/2026-10-20-*.md` records 9 more cost ideas tested offline on real-use transcripts, from refusals in one call and a red-loop breaker to reusing the Proof at landing and a builder that lands its own task; none lands, each misses the 3%-of-bucket bar or its quality guard, and `benchmarks/speed-ledger.jsonl` records reviews starting before the gate as already landed in `779e1294`.
- `benchmarks/results/2026-10-20-*.md` records 16 more cost ideas tested offline or in small paid probes across sessions 6 and 7, from build-task model tier and range reads to review diff spills and lean lead tools; none lands, and `benchmarks/speed-ledger.jsonl` lists each with when to retry it.
- `benchmarks/results/2026-10-20-cache-ttl-real-use.md`, `-script-retries.md`, `-repeat-read.md` and `-bash-trim.md` test five cost ideas offline on real-use transcripts; none lands: run-unit back to a 5-minute cache costs +58% in real use, a 1-hour cache costs build-task, review-branch and fix-review 33-44% more, and script error text, repeat-read dedupe and passing-output trim each save under 1.5% of run cost.
- `benchmarks/results/2026-10-20-checkpoint-fork.md` tests rerunning only the verify block from a kept flow-unit cell (`sweep.mjs --keep-repo`, `benchmarks/checkpoint-fork.mjs`), 5 full cells against 8 forks: it does not land: verify tokens 69,943 vs 86,038 (p=0.008) because each fork pays prompt-cache creation, cost $0.222 vs $0.266 within noise (p=0.242), a fork costs 0.44 of a full cell.
- `benchmarks/speed-ledger.jsonl` is now the checked source of the speed ledger, with `benchmarks/speed-ledger.md` generated from it, and `benchmarks/baseline-pool.mjs` reuses a stored baseline arm when its content key matches.
- `benchmarks/results/2026-10-20-speed-round8.md` records a flow-unit baseline at n=15 after the `truncate` fixture fix: the `max < 3` repair loop did not recur (0 of 15, against 3 of 15), fix-review still ran in 2 of 15 runs on unrelated concerns, hidden tests 270/270, cost unchanged within noise; wall fell 28% but at a different concurrency, so later rounds rerun their own base arm.
- `benchmarks/results/2026-10-19-speed-round7.md` tests a `build-task` line asking for a test at each limit a `Data:` line implies, at n=15 per arm; it does not land: wall -2.9% not supported (CI [-31.7, +17.7] s, p=0.645), cost +1.0% within noise, the `max < 3` repair loop still ran in 3 of 15 runs in both arms, hidden tests 255/255 in both arms.
- `benchmarks/results/2026-10-19-build-profile.md` profiles 45 saved flow-unit runs: build-task is the largest and most variable step (65.2 s, 31.7% of wall); the review fix loop explains about 44% of wall variance, ran in 10 of 45 runs, adds about 75 s and $0.23, and every loop repairs one `max < 3` input the plan leaves undefined, which hidden tests never grade.
- `benchmarks/results/2026-10-19-speed-round4.md` tests a batch-independent-tool-calls line in agent prompts at n=15 per arm; it does not land: wall -4.7% not supported (CI [-43.3, +23.4] s, p=0.389), cost -8.8% (p=0.016) mostly from fewer fix loops, hidden tests 255/255 in both arms.
- `benchmarks/results/2026-10-19-speed-round3.md` reruns script-owned fan-out against base at n=15 per arm; fan-out is slower (wall +24.8%, CI [+12.2, +83.9] s, p=0.037), cost +2.7% within noise, hidden tests 17/17 in every run, so it does not land.
- `benchmarks/results/2026-10-19-speed-round2.md` measures two build-speed ideas at n=5 per arm; neither lands: reviewer kind from the script (wall -1.7%, cost +1.7%) and script-owned fan-out (wall -11.7%, cost -8.3%, p=0.31); hidden tests 17/17 in every run.
- `benchmarks/speed-ledger.md` lists every build-speed idea that did not land, with its evidence and when to retry it.
- Flow benchmark records store review-stage counts and tokens excluding review and fix.
- `benchmarks/results/2026-10-19-build-speed.md` records the build-field speed A/B (n=2 per arm); its gains rest on one run that skipped two review stages, and every run failed the same 3 hidden tests.
- `benchmarks/results/2026-10-19-build-speed-rerun.md` reruns it at n=3 per arm with the fixed fixture: hidden tests 17/17 in every run, run-unit calls -15%, and no wall, cost or token change beyond run-to-run noise.
- A plan task's `Evidence:` field lands as an `Evidence:` commit trailer.
- `benchmarks/results/2026-10-19-pressure-grade-compression-rerun.md` records the compression case after the judge line fix: with 67%, without 67%, delta +0%; no answer fails for naming `Math.floor`.
- `npm run check` fails a branch that changes skill or agent text without an `Evidence:` trailer naming a fresh result or `none (<reason>)`; `plan-check` flags a plan that changes such text and names no `Evidence:`.

### Changed
- The statusline shows context against the 80k limit, green below 60k, cyan from 60k and purple at 80k; it always shows the `7d` limit next to `5h`, and follows each percentage with the time until it resets, such as `5h 76% resets in 1h 20m   7d 40% resets in 3d 4h`.
- exo asks a question only when the answer is a plain product choice only the user can make, and `exo:spec` defaults to zero questions and records its own decisions; every claude agent kind runs at a sonnet-medium floor with opus high for judging, and the kind table picks agent models; the `context` setting is replaced by a fixed 80k limit (task cap 15k, work split into chunks for subagents, a context-ended agent continues on the same kind and model); agents run proofs to a log and open with a tool call, `Next:` build dispatches print a `Wait:` line with three wait-report reruns instead of six, started shells and agents stop before an agent returns, a headless run kills its process tree after the exit grace, a GNU `sed -i` edit runs on BSD sed, an unquoted `$NAME` list splits in a zsh `for` loop, and `review-branch` gets the log and first-tool-call lines.
- `exo:design-ui` derives its direction from the subject's world (`deal.mjs` is only a seed now), fills every region of the frame with product-led detail, drops the art, single-Write, font-file and colour-quota caps, and ends with a fresh-eyes screenshot critique and one fix round; on 2 SaaS sites it scored 0 look fails in 766-915 s against impeccable's 18-34.
- `exo:design-ui` builds app briefs as a real app that fits the 1440x900 window with a bottom tab bar at 390, deals 3 of 12 directions with `scripts/deal.mjs`, caps type at 2 faces, gives each item its own art, writes the page in one file, and `look.mjs` now flags clipped or overlapping text, extra fonts and app pages taller than the window; a run averaged 449 s and 461k billed tokens on game-launcher and social, from 720 s at the cap (`benchmarks/results/2026-10-25-design-ui-round3.md`).
- `exo:design-ui` measures each page with `scripts/look.mjs` (contrast with opacity and stacked backgrounds, overflow at 390, console errors, missing or below-3000-px requirement anchors), keeps content visible without motion, names current AI defaults to avoid, and edits instead of rewriting; on the 4-task eval: contrast 4/4, 368 s and 871,400 billed tokens per run against 408 s and 981,074.
- `exo:design-ui` is rewritten from scratch as one short skill with three references: it builds the real page straight away, asks no question unless the request cannot be built without the answer, and counts motion, `prefers-reduced-motion` and every state as part of done; its `build-ui`, `critique-ui` and `survey-ui` agents, `benchmarks/design-run.mjs` and its pressure tests are gone.
- `exo:adhd` sends a requested deliverable, such as a commit message, title, command or snippet, as that text alone, with no bold, backticks or words around it; on `node benchmarks/adhd-score.mjs` this scored 0.457 against 0.488 at baseline, with fewer gate failures (11.3 against 14.7 a run) and fewer missing facts (5.2 against 6.1), the only one of six phase-2 ideas kept.
- `node benchmarks/adhd-score.mjs` prints each case's visible and billed output tokens with billed totals, runs the adhd arm 3 times per case by default under a $3 cap, and gates a reply on a closing question, a pure deliverable and every fact of an explain request; the case set gains question, deliverable and explain cases from real chats.
- `exo:adhd` checks each reply in one line before sending: every asked part has its clause, the Yes or No matches the source, and each claim keeps its name and figure; `node benchmarks/adhd-score.mjs --runs 3` scores 0.311 against 0.41 before.
- The status line is a two-line status line: line one shows where and who (mark, branch, model, effort, the session's own live in-session build), line two shows what is left (context against exo's budget, 5h usage and, when it matters, 7d usage and a 5h run-out warning).
- `exo:improve` runs one worker per round (opus/high) that proposes a gated, large, non-duplicate idea and edits it, while scripts do the setup, score, keep or reset, and log one row.
- Short replies now come from one output style, `exo:adhd` (`output-styles/adhd.md`), turned on with `/output-style`.
- `exo:adhd` ends each reply with one bold answer sentence of at most 15 words, gives no reasons unless asked, and answers yes/no questions with Yes, No or Maybe; `node benchmarks/adhd-score.mjs` 1.00 → 0.72 over 17 `exo:improve` rounds.
- `exo:adhd` bolds the whole answer sentence and shows three example replies; `node benchmarks/adhd-score.mjs` 0.73 → 0.59 over 24 `exo:improve` rounds.
- The `budget` setting now takes only `on` or `off`; `on` routes each dispatch by kind from one rule table and steps a build-task or doc-task one level up on its retry after a failed check.
- Stage ends keep the session: spec asks once whether to start the build or change it, and a finished build ends on a line inviting changes; `locate-code` and `find-open-points` write their full report to `.exo/<topic>/` and return at most 10 lines, `fetch-docs` returns at most 12, `hooks/session-rules.md` bans page and whole-file dumps in the lead.
- `exo:build` runs faster: `start-run` prints the first dispatch block, the first wave fans out at once when every task is independent, and `run-unit` waits for the whole wave and lands every slot in one chained call when nothing is left to refill; flow-unit wall time fell 13.0% (176.8 s → 153.9 s mean, n=15).
- `docs/principles/harness.md` adds that `SubagentStop` and `TaskCompleted` hooks can block, that `/goal` is a prompt-based Stop hook judged by a fresh model and runs no command, and that plugin agents ignore `hooks`, `permissionMode` and `mcpServers`; it cites the managed-agents post on the strip-one-at-a-time bullet and no longer lists `stop_hook_active` as a gap, since `BLOCK_LIMIT = 2` in `hooks/run-no-wait.mjs` is stricter. `docs/principles/eval.md` adds an isolated judge per dimension, deterministic graders first and a nearly perfect task verifier.
- `npm run check` fails a principle page cite whose file or anchor is gone, and fails any malformed `Evidence:` commit line in the range, even with no wording change.
- spec opens `docs/principles/README.md` when a request adds or changes an AI agent or LLM worker, its prompt, tools or loop; 3 of 3 runs opened it, up from 0 of 3, and the spec body cap rose from 783 to 790 tokens to pay for it.
- The body budget PASS line in `npm run check` lists the headroom of each capped skill and agent.
- The session rule "Delete would unblock → report 2-3 options" now asks for a project edit that gets the command green as typed and destroys nothing, with options only for the destructive step; against a rival skills plugin on 8 tasks (sonnet, 40 pairs) exo wins 9, loses 0 (sign test p=0.002), passes 36/40 hidden checks against 28/40, at $0.113 against $0.136 per task.
- The README has a new icon, logos and 1280x640 social preview (a terminal clad in steel plates on dark gunmetal, with an orange prompt), opens with "An exoskeleton for AI engineering.", rewrites `## Use` with before and after examples, and drops the false claim that hooks refuse risky commands.
- `README.md` drops from 939 to 457 words: it opens with a light and dark logo, install starts with one command and folds the Claude Code, Codex and update steps, and the numbers block is gone, since a same-batch run in `benchmarks/results/2026-10-21-h2h-baseline-exo.md` gives plain Claude Code 18/25 and exo 20/25 (0.7 SE) at 1.38 times the cost; `assets/` gains a new social preview naming Claude Code and Codex, and an icon in `icon.svg`, `icon-512.png`, `logo-light.svg` and `logo-dark.svg`.
- `prompt` leaves out lines the session already covers through CLAUDE.md, rules, memory, hooks, tests or scripts, and ends with at most 3 `Suggest:` lines, none when nothing is worth changing, then `Ok to run it?`; the `Added:`, `Dropped:`, `Misfit:` and `Missing:` lines are gone, and a rewritten prompt fed back comes out unchanged.
- The lead's brief, model-choice and own-work rules now arrive at the first Agent call instead of session start, and the nine dispatched-only agents carry one-line descriptions (84 to 38 words).
- The done rules now reuse an existing failing test or repro as proof, write one smallest test per cause only when none exists, run each named order, seed, timezone or input variant once and show it took effect, and read the failing command's full output and the README rules for touched code.
- A reported bug or small change gets one plain attempt first (repro, fix, proof); `find-cause` starts only when no one-command repro exists or the proof stays red, so routing picks it for 5 of 10 bug prompts, down from 10 of 10, and never on a wrong prompt.
- Session rules ask for a repro that fails before the fix, a fix for every named cause before stopping, and a read of the repo docs before asking the user; the delegation rule no longer fans out small parts.
- run-unit runs with `omitClaudeMd: true`, so it no longer loads `CLAUDE.md`: 4.83% less run-unit cost (CI 4.15-5.79%, about 0.28% of a run), and a paid flow-unit run still landed 4 of 4 tasks at $0.595 against $0.598.
- verify dispatches the review fixer for a `concern` only when it claims wrong behavior: the reviewer writes style, naming, layout and test-gap findings as the new `note` kind, which `merge-reviews.mjs` counts and lists for the report and which never starts the fixer.
- `benchmarks/speed-ledger.md` points each rejected idea at its results file, since its idea branches are deleted.
- Build and verify scripts print the next step (filled build prompts, slot worktrees, review dispatch fields, findings), so run-unit and the lead skip about 5 bookkeeping turns; flow-unit wall -22% (p=0.026) and cost -16% (p=0.0023) at n=15, of which the change itself is likely 5-10%.
- `benchmarks/speed-ledger.md` opens with a one-line-per-idea index and adds 8 ideas from Anthropic's engineering posts and Agent SDK docs; `.claude/CLAUDE.md` points every build speed or cost brainstorm at that index.
- Routing is measured by a paid model run, `benchmarks/routing.mjs`, and `npm run check` fails when a skill description or `hooks/session-routing.md` changed after the last recorded result.
- `npm run check` runs `claude plugin validate --strict --json` and fails on any warning or error; the project notes moved so strict validate passes.
- `edit-skills` counts a stored result as evidence only when it covers the last edit, and tells the editor to name it in an `Evidence:` trailer.
- `plan-check` and the `edit evidence` check share one set of wording-path and evidence-value rules in `lib/evidence-rules.mjs`; a result path with a space now fails as a malformed value.
- `npm run check` also requires an `Evidence:` trailer for a change to the session-start text that `hooks/session-start.mjs` injects.
- `pressure.mjs --grade` scores each pressure run pass or fail against tagged criteria lines, applies a pass threshold over 3 runs and reports the with-minus-without delta.
- `exo:build` lands a unit-route task with one `land-slot` script call, skips `wait-report` after a foreground `Next: build`, and runs `run-unit` at low effort on the balanced profile.

### Fixed
- `node benchmarks/adhd-score.mjs --baseline` replies only for cases missing from `baseline.json` (`--all` rebuilds every case), saves after each case, and names the case and arm when a reply call fails, so one hung call no longer loses a paid run; the `choice-worktree-cleanup` case says the chat has no tools, because its tool-less reply faked shell calls past the 90 s call cap.
- `node benchmarks/adhd-score.mjs` scores the 23 cases 8 at a time, gives each run its own ratio so one failed run no longer forces the case to 1, measures length in visible reply tokens instead of billed `output_tokens` with thinking, prints the score to three decimals with `pass_rate` and `pass_ratio`, corrects two `lead` gates, caps each `claude -p` call at 90 s with one retry (`EXO_ADHD_CALL_MS`), judges only the required facts, one verdict per fact with each reply alone and a majority of 3 votes calibrated on known-FAIL labels (`--add-fail-labels`), and gives partial credit for missing facts; three runs scored 0.398/0.391/0.367 in 24-25 s each.
- The plan checker refuses a `Land gate:` or `Lint:` command wrapped in backticks, and an HTML entity such as `&gt;` in any command the run executes, so a build no longer fails on a command it cannot run as written.
- The status line, the `exo` shim and exo-cli fall back to the main checkout, recorded in `~/.claude/exo/plugin-main`, when `plugin-root` names a removed worktree; the status line had gone blank. Run `exo setup` once to refresh an old shim.
- `exo:improve` keeps its results file and score log in `.exo/improve/`, so removing the loop worktree with `remove-worktree.mjs --kept` saves them instead of deleting them.
- verify, its repair loop, the design-task wait and spec's watch end the turn with no ScheduleWakeup, Monitor or sleep while background work runs; a 1200 s wakeup had kept a finished `claude -p` run alive past its budget.
- A `REFUSED` window landing no longer stalls its rebuild for ~9 min: `land-slot.mjs` now prints a `Wait:` and `Land <n>:` for the rebuild with a `--since` taken at the refusal, and `wait-report.mjs` refuses a `--since` later than now at once with an `ERROR` line instead of waiting out its deadline.
- The Bash hook rewrites a call so zsh runs every part of a chain holding an `=` word, and each `timeout N` command stays bounded on stock macOS, which lacks GNU `timeout`.
- `run-probes.mjs` fails a finding that has a `Probe:` line but no `fixed` or `reported:` mark, instead of skipping it with exit 0; on a fixer turn cap, verify marks each unmarked finding `reported: turn cap`.
- The edit evidence check names the commit that holds a bad `Evidence:` trailer.
- A memory line saved before the `retired` field existed counts as live again, so its lesson shows in every session.
- The Codex copy rewrites skill links that leave the skill folder to the exo root, and generation fails on any such link left over; five links were dead in a Codex install.
- `build` carries the plan's `## Assumptions` input paths into each builder brief, stops a task before dispatch when a named absolute input path is unreachable, and tells the builder to block on an unreadable input instead of writing its content from memory.
- The closing and report rules now live in `skills/route-skills/references/closing.md` and load by path from every skill that cites them, with a check that each owner skill lists it.
- Corrected steps and docs from the component audit in `build`, `verify`, `design-ui`, `file-issues`, `spec`, `run-plan`, `CONTRIBUTING.md` and the session-start hook so they match the code.
- `tests/clean-run-env.mjs` points `TMPDIR` at one folder per test run and deletes it on exit, so `npm test` and `npm run check` stop leaving `mkdtemp` folders in the user temp folder; 12 days of leftovers made macOS boot cleanup take 183 s.
- `benchmarks/baseline-pool.mjs` keys round 2 by `71a42460` on `main`, not the unpushed run-branch commit `c087a7aa`, so `npm run check` passes in a clone of origin again; a test now fails when a round commit is not an ancestor of `HEAD`.
- Session rules tell the lead to stop an agent whose notice says it still waits on background work, and to stop every background shell and agent before the final report, so no task stays running after the turn; on Codex, `TaskStop` maps to killing the process.
- Session start reads settings from the session folder, not the hook's working folder.
- `benchmarks/mde.mjs` and `benchmarks/statistics.mjs` report an effect as undetectable at a given n instead of capping it at 0.300.
- The flow benchmark's `truncate` plan now says `truncate` throws a `RangeError` when `max` is below 3, with a matching hidden test; the plan left that case open, so builder and reviewer disagreed and the review repair loop ran on an input no hidden test graded. Loop rates from rounds before this fix do not compare directly with later rounds.
- verify dispatches the review fixer for every `concern` finding, also when no `fix` finding exists, instead of the lead reporting it unproven without a test.
- run-unit finds the build scripts in its own plugin instead of searching the disk and running an older installed copy; benchmark cells turn off the installed exo.
- `land-task` no longer prints a `Next: Task <n>` line that looks ready to dispatch without a brief; it points at `next-task.mjs`, which writes the brief.
- `/exo:prompt` no longer turns on maximum thinking on every run or adds that keyword to a rewrite the user never asked for; the skill named the keyword literally, and Claude Code read it as typed by the user.
- The compression pressure case's judge line no longer fails a correct answer that names `toCents` flooring the float product as the cause.
- The `flow-unit` benchmark cell's compact plan states each helper's behavior, so a build that follows it can pass the hidden `truncate` tests; every run failed 3 of them before.
- `benchmarks/sweep.mjs --repeat <n>` repeats every set, not only replay; copies keep one cell id, so reports average them as one arm, and each writes its own result dir.
- A plan task's `Drops:` words now reach its Proof run as well as its Land gate, so a Proof that runs `npm run validate:static` no longer fails on a word the plan allows.
- `CONTRIBUTING.md` and `docs/skills/build.md` state the real deep-reviewer trigger, a landed task's `Risk:` field naming a security boundary, and `verify/checks/shared-contracts.mjs` pins that wording.

### Removed
- The `compression` setting and the `exo:short` output style; use `exo:adhd` instead.

## 0.136.0 - 2026-10-19

### Highlights
- **Inside Claude Code, exo now builds a plan with subagents; a headless run starts only from the terminal `exo run`.**
- **exo no longer blocks risky git commands, destructive shell commands or shell reads of secret files; set `permissions.deny` rules or the sandbox in your own settings to keep them blocked.**
- **A new session now orchestrates efficiently and picks a fitting model and effort per agent by default; set `budget` to `off` to keep the old behavior.**

### Added
- `benchmarks/results/2026-10-18-ideas-baseline.md` records the first ideas baseline: 15 runs, 4 distinct shapes per run, mean originality 1.397 of 5, no option both original and fitting.
- The `spec-cliches` (A3) and `spec-roles` (A1) ideas arms, in `benchmarks/results/2026-10-18-ideas-spec-*.md`, moved originality by 0.001 and 0.05 (noise), so spec stays unchanged and `benchmarks/variants.mjs` drops both variants.
- The ideas bench scores the recommended option's originality and fit, and each run's tokens and cost, subagents included.
- `benchmarks/results/2026-10-18-ideas-spec-seats.md` records the `spec-seats` arm: originality 1.413 → 1.993, fit 3.438 → 3.598, modal share 0.933 → 0.644, at 3.91x cost per run.
- `benchmarks/results/2026-10-19-ideas-cheap.md` and `2026-10-19-ideas-lean.md` record nine cheaper arms; the winner, one context with drawn seats and the likeliest shape dropped, stopping at the options, reached originality 2.306, fit 3.717 and modal share 0.467 at 1.63x base cost.
- `benchmarks/ideas.mjs` gains `--jobs <n>` to run cells at once, one HOME per cell, and `EXO_IDEAS_EFFORT` to set the lead effort.
- `benchmarks/ideas.mjs` runs a neutral design request N times per case in fresh sessions, a blind calibrated judge scores each option, and the results file gives the minimum detectable effect per metric.
- `exo:spec` carries a measured-goal method (calibrate, size, ablate, pair, class failures), and benchmarks/tbench/ lands as the runner it uses.
- `architecture-sketch.md` sets 3-5 criteria before sketching, gives each candidate its own named constraint, redoes one when all share a shape, scores per criterion and grafts parts of two candidates.
- A design question privately drafts at least 5 routes and shows the most distinct, at least one not first to mind.
- Error-case replay: the saved cases, their runner and grader are tracked under benchmarks/replay/, with home paths redacted.
- A detached run reports each session's cache read share and warns when turn 1 writes a large cache.
- plan-check warns on adjacent tiny plan tasks.
- plan-check flags a task that names a lock constant, such as `SESSION_LOAD_LOCK`, when its Files omit the file that defines it.
- A detached run denies `npm publish`, Vercel, Netlify and Fly deploy commands.
- A detached run saves the commit its branch review saw, as `pre-fix-head` and `pre-fix.patch` in the run log folder, before the review fix lands.
- Land refuses a task whose `Data:` names a backticked string found nowhere in its change or the tree, unless the task sets `Literals: none (<reason>)`; the code rules fail on uneven spacing around `=` and a missing space after a comma.
- `node benchmarks/score.mjs <dir> --compare <before>,<after>` compares two arms of one run: per task, cost and wall time after − before, 2 SE_diff, a rise, noise or fall verdict, the CV and the next run count.
- `benchmarks/run.mjs --before-plugin <dir>` adds an `exo-before` arm that loads exo from another checkout, so one run compares a change with the commit before it.

### Changed
- `edit-skills` teaches a Produce/Avoid opening as the default, with existing enemy/overcorrection openings migrating on next edit; `process-structure` drops its minimum of three numbered steps and only requires a numbered list to run 1..n.
- `design-ui` opens on what to produce and an avoid-list, which `process-structure` now accepts beside the enemy/overcorrection shape; `check-docs` states when a research pass ends the turn as a condition; `start` drops its dangling several-fit step.
- spec options draw a seat and a forbidden move per option with `scripts/draw-seats.mjs`, drop the likeliest shape, and stop at the options for the user to pick.
- Prompt-audit fixes: edit-skills defers its check step to the caller, build-task reports a hung proof instead of rerunning it, start points at `hooks/session-routing.md`, save-session keeps WIP off a run branch and `handoff.mjs` reads the host config root, agents without Bash drop the delete ban, and spec, design-ui, check-docs, prompt, refactor, ship, run-plan, review-branch and build lose stale or unexplained lines.
- `exo-cli.mjs run`, `exo approve` and `run-plan.mjs` refuse to start inside a Claude Code session (exit 2); `/exo:run-plan` hands the plan to `exo:build`, and benchmark sweep cells still run.
- spec sends locate-code and fetch-docs in one message; find-open-points, build-task and review-branch batch their opening reads, saving a serial turn each.
- The main session cannot Read a whole saved oversized tool output; it reads a line range, greps or sends a subagent.
- Session rules say the lead reads no file its brief points to.
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
- spec ends on one question whether to start the build now; the background build starts only on your pick, and the option says how the work lands.
- A run checks a moved remote ref with two git calls, not one per run commit, so the first fetch into a repo with no remote refs is no longer slow.
- design-ui's References table keeps only phase and section names for the full-run rows; their conditions moved to phase-detail's Full run, read only on a full run.
- build-ui's comp and repair steps moved into the existing comp sections of direction-preview and phase-build, so a foundation or surface builder reads fewer lines.
- design-ui's `capture.mjs` prints only label, size, path and engine per render, so a builder reads about 310 fewer bytes per two-viewport call.

### Fixed
- `edit-skills` step 6 no longer reads as banning the three named agent budget exemptions; it bans adding an exemption, lock or allowlist entry to turn a red check green.
- `npm run bump` now also sets both `package-lock.json` version fields, so `npm install` stops leaving the lockfile dirty; the lockfile is synced to 0.135.0.
- `exo:prompt` rewrites a pasted screen into short facts, carries a clash with a fixed fact as an open point, grants a stated outside write in the user's words, and flags a named skill that rules out the task.
- `compareMeans` in `benchmarks/statistics.mjs` gives no verdict when both arms have sd 0, so a zero-spread baseline no longer claims any difference is detectable.
- A test runs a real fixture-repo test under the run session env, so a session git block that reaches other repos fails `npm run check`.
- `benchmarks/prices.mjs` prices Sonnet 5.5 cache reads at its list price of $0.10 per million tokens, not the Sonnet 5 rate of $0.20.
- A detached run's task and plan sessions can no longer commit or move a ref in the run's repo: git refuses the update and says the script lands each task after the session; a plan session's brief no longer copies the tasks' `Commit:` blocks.
- In a sandboxed run session, a land-task or run-decision call inside a loop, variable or chain is refused with the bare `node "<path>"` form to run, instead of a don't-ask denial that stopped the run.
- Benchmark cells no longer load the user's global `~/.claude/CLAUDE.md`; `makeDefaultOptionsHome({ withoutClaudeMd: true })` builds such a home for other harnesses.
- A stopped detached run now tells the lead to send its repair to one worktree agent and edit no file itself; the two-repair cap counts only `task <n> blocked:` stop lines in `run.log`.
- The land check skips an untracked path that is a registered git worktree, so a repair agent's worktree inside the checkout no longer blocks the resumed run.
- A detached run no longer stops when another session pushes or fetches; only a remote ref move the run caused counts as a breach.
- The boundary words check no longer fails a branch that is behind origin/main for words main added; it compares against the merge base.
- Land no longer refuses a Data literal whose pieces name existing folders or path parts, such as a brace pattern over new files.
- spec writes the brief right after the last answer instead of asking for a yes first, and asks no landing question in a folder with no git remote, so the open points check runs.
- plan-check refuses a task whose Data names an existing path outside the repository or git-ignored, which land can never find, unless the task sets Literals: none.
- Shell heredocs work in benchmark and pressure runs under the macOS sandbox; before, a heredoc left its target file empty, so older results may hold such failures. The `file-issues` stand-in `gh` now logs each issue body and fails like `gh` on a missing body file; that test's case a, which the skill always passed, is now a bug nobody has reproduced, and case c no longer requires `### Steps`.
- The `file-issues` pressure fixture now holds the README that case c cites, so a run that checks the README finds the line to fix.
- A replay run started at the repository root no longer leaves its output, home paths included, where git would commit it; `/runs/` and every `runs/` under `benchmarks/replay/` are ignored, and the runner usage starts `node benchmarks/replay/runner.mjs` with `--out benchmarks/replay/runs/<name>`.
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
- The review benchmark's clean control samples now handle a NUL byte in a name, CSV quotes, a BOM, non-decimal amounts and idle rate-limit keys; controls with one fell from 3 of 5 to 0 of 5.
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
- A stopped run's wait output and wake prompt point to spec's watching reference, which holds the repair cap, instead of build's step loop.
- The watching reference's plan-check command finds spec's script when build reads it too.
- run-unit no longer reads the lead-only run loop; the frame it needs comes in its brief file.
- ship removes a merged pull request's worktree with remove-worktree.mjs, so its `.exo/` run report is kept.
- `score.mjs --compare` judges pass rate first, so an arm that fails fast no longer reads as cheaper.
- The review benchmark's csv-sum control reference sums decimals exactly, reads quoted fields that span lines and keeps valid rows after a stray quote, and sweep cells copy only the task's file from its fixture folder; at `high`, the branch reviewer found 15 of 15 seeded defects and raised a `fix` on 1 of 12 control branches of the four tasks other than csv-sum (`benchmarks/results/2026-10-18-review-high.md`).
- The review-at-`high` results file no longer says its three `concern` findings marked `fix` are reviewer eval cases, and quotes the two of them that were only in git-ignored run folders.

### Removed
- `benchmarks/variants.mjs` drops the `spec-seats` variant and the eleven 2026-10-19 ideas variants, now shipped or measured.
- The git guard and the secret guard on Bash: force push, `reset --hard`, `clean -f`, a stash drop, a branch force-delete, a whole-tree checkout and a shell read of a `Read(...)`-denied path now pass.
- The destructive-command guard, the comment guard, the run gate hook and the `guards` setting.
- `skills/edit-skills/references/cut-log.md`; its two restored cuts now sit in step 3 of `exo:edit-skills`.

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
