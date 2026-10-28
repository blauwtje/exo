# Changelog

Versions follow [Semantic Versioning](https://semver.org/spec/v2.0.0.html). A
skill's trigger, a skill or agent name, and the `exo:` namespace are the public
surface: renaming or removing one is a breaking change, adding one is a minor
release, and a body rewrite that keeps the trigger is a patch.

Versions before 0.134.10 are in [CHANGELOG-archive.md](CHANGELOG-archive.md).

## Unreleased

### Added
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

### Changed
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

### Fixed
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

## 0.134.10 - 2026-10-14

### Fixed
- `exo:build` runs a plan's Success command once per tree when red-green is on: the final verify and a resume on an unchanged tree reuse red-green's recorded pass instead of running it again.
