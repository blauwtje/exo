# Changelog

Versions follow [Semantic Versioning](https://semver.org/spec/v2.0.0.html). A
skill's trigger, a skill or agent name, and the `exo:` namespace are the public
surface: renaming or removing one is a breaking change, adding one is a minor
release, and a body rewrite that keeps the trigger is a patch.

## Unreleased

### Changed

- The context watch and the delegate budget run as one PreToolUse hook on every tool that branches on `agent_id`, and the watch reads the `context` setting in-process through `lib/settings-store.mjs` instead of spawning `settings.mjs`, so a tool call starts one node process instead of two or three.

## 0.38.1 - 2026-09-24

### Highlights

**The context watch now measures the main session on every tool call and, from 150k tokens, shows you the handoff notice too.**

### Changed

- The context watch runs after every tool call instead of only a completed `TaskUpdate`, reads the transcript through the tail reader it now shares with the delegate budget in `transcript-tail.mjs`, tells the main session from the `context` setting, and again after each further 25k, to finish its step and have the user run `/exo:handoff` then `/clear`, adds the notice as a `systemMessage` from 150k, and never denies a tool; the `context` default rises from 80 to 100.

## 0.38.0 - 2026-09-24

### Added

- `designing` gains `scripts/checkpoint.mjs --stage baseline|post-build|final`: one call captures both viewports, runs `check-ui`, `inspect-render` against the matching baseline and `inspect-styles`, and writes the critic's evidence file; `check-ui.mjs` takes several `--viewport` values in one run, prints `threshold` and `note` once in a notes table, and adds `--summary`.
- `agents/design-builder.md` carries the designing builder as a sonnet agent with one scope per dispatch, `foundation`, `<surface>` or `repair:<surface>`, and a `maxTurns`; `builder-prompt.md` and the `all` scope are removed, repair runs as that agent without the counted 12-call cap, and QA always runs in a delegate.
- `shipping` gains `scripts/ship.mjs`: one call pushes, opens or reuses the pull request, waits, gates, merges and confirms, copies labels and milestone from `--issue`, runs a stacked `--merge` list bases first, and prints one `<url> merged|open|stopped <step> <reason>` line per pull request.
- `debug` runs in phases around one handoff file under `<git-dir>/exo/debug/`: an opus investigate delegate proves the cause, a sonnet fix delegate reads only the handoff and its ranges, `bug-fixer-prompt.md` uses the same file, and step 7 takes its review effort from `pick-reviewer.mjs`.
- `deepen` gains `scripts/hotspots.mjs`, printing the most-changed paths over six months, and its audit runs in a delegate from `auditor-prompt.md` that writes at most five cards to `<git-dir>/exo/deepen/<topic>.md`, from which the session ranks.
- `shaping` gains `scripts/map-transition.mjs` and `round-text.mjs`: `question-page.mjs --add`, `--apply` and `--text` add decisions, apply an answer and render a round in the chat layout, so the session never rewrites `map.json`, and chat mode keeps the map file too.
- `issuing` gains `scripts/repo-fields.mjs`, printing the repository's labels, milestones, projects and owner as one JSON cached for a day, with `--size` computing Size, Estimate and Priority; `shipping` reuses it for a pull request without an issue.
- `skills-tool` gains `scripts/pressure.mjs`, running both arms of every `--cells` model and effort in parallel and printing three lines per cell.
- `using-exo` gains `scripts/next-stage.mjs --after <stage> --artifact <path>`, printing the next-stage options and model line, so a stage no longer reads two references at its end.
- `handoff.mjs path` prints the handoff location the session-start hook computes, and `handoff` uses it.
- `benchmarks` gains the `branch-review.md` fixture, so `sweep.mjs --confirm` runs the fixer cells.

### Changed

- `implementing-batch` step 7 runs the review in a delegate that writes a findings file, and the fix step reads only that file.
- The savings hooks keep per-session hot state in its own file with its own lock and touch the 30-day `sessions.json` only from the Stop hook and the report, so a hook no longer rewrites the whole record.
- A named-direction `Design:` plan task runs `designing` in the implementing session instead of in `exo:implementer`.
- `## Wave worktrees` moves from `implementing/references/workspace.md` into its own `wave-worktrees.md`, which only `implementing` reads.
- The delegate budget hook's token limit rises from 70k to 100k; the 60 tool-call limit is unchanged.
- `CLAUDE.md` splits a run that spans exploring, building and reviewing into phases, each a fresh subagent handing over through a file.

### Fixed

- `settings.mjs` falls through to the next layer on an invalid value in a higher one instead of the default, and the context line names the bad file.

## 0.37.1 - 2026-09-24

### Changed

- `CLAUDE.md` deletes each run branch in its own `git branch -D <name>` with the literal name, forbids `git stash` in a subagent, and drops a run's stash once its content is on `main`.

## 0.37.0 - 2026-09-24

### Added

- `shipping` gains `scripts/ship-gate.mjs`: `--pr <n>` prints one verdict, `MERGE`, `BEHIND`, `DIRTY` or `STOP <field>=<value> [check]`, passing SKIPPED and NEUTRAL checks and stopping on CANCELLED, and `--order <n...>` prints stacked pull requests bases first and exits non-zero on a cycle; `SKILL.md` runs both instead of reading JSON.
- `agents/researcher.md` carries the researcher as a sonnet agent with web and read tools only, a `maxTurns` and its own no-delete rule; `research` dispatches it with only the question, and `researcher-prompt.md` is removed.
- The implementer's brief lists `path:start-end` for each `Modify:` region, from its definition to where the region ends, and `implementer` reads those ranges instead of whole files.
- `benchmarks/sweep-cells.mjs` models the review-fixer step as a `fixer` cell set; `sweep.mjs --confirm` refuses a fixer cell until a `branch-review.md` fixture exists.

### Changed

- The repeat guard also denies a second identical WebFetch URL or WebSearch query from the same agent.
- `design-critic`'s reference only reads the `$RUN` files the session already wrote rather than running scripts, and the builder brief names the `## Slop tropes` section of `visual-critique.md` so the builder may read it.

### Fixed

- A note sent from the browser interview tab's footer now carries the current picks, instead of dropping them and asking the whole round again.
- `question-page.mjs` prints its own line on exit 3 telling the session to ask the round in the conversation, exits 2 on a round asking more than four decisions or a decision asked with the open parent it waits on, and opens a decision waiting on an already closed parent.
- `check-ui.mjs` tracks its token-block state by brace depth, so a one-line `:root { ... }` no longer hides raw values in the next rule.
- `inspect-render.mjs --baseline` takes one baseline per image, paired by position, and its `pairs` only compare images of the same size.

## 0.36.0 - 2026-09-24

### Added

- `planning` runs the new `scripts/plan-check.mjs` instead of reading the whole plan back: it checks each task's `Commit:` block and `Plan-task:` trailer, that `git add` paths equal `Files:`, `Run:` and `Expected:` on every step with code, placeholders, and asks to split a task above 250 code lines or 4 files.
- `next-task.mjs` prints a `Budget: <soft>k/<hard>k` line per task, scaled by the task's size between half the delegate defaults and the defaults, and `implementing` carries it verbatim into the implementer dispatch so the delegate-budget hook applies it.

### Changed

- `branch-reviewer` and `branch-reviewer-deep` only review and write their report, returning one `verdict=` line; on FINDINGS `implementing` dispatches a sonnet fixer from `review-fixer-prompt.md`, then runs the Final verification once more.
- The plan parser moves from `skills/implementing/scripts/plan-tasks.mjs` to `lib/plan-tasks.mjs` behind the `#plan-tasks` alias and exports `taskSize`, so `planning` and `implementing` share it.
- `designing`'s intake and visual direction read `approval_status` from `context.mjs` rather than opening `DESIGN.md` to learn whether its identity is approved.

## 0.35.3 - 2026-09-24

### Changed

- `CLAUDE.md` keeps only rules a session would get wrong without them, and landing now fetches and rebases the integration branch onto `origin/main` before fast-forwarding `main`, so the release workflow's `chore(release)` commit no longer gets the push rejected.

## 0.35.2 - 2026-09-24

### Changed

- `CLAUDE.md` gives each subagent one bug or one concern and splits a brief with two unrelated parts, because two bugs plus a skill load drove a subagent into the budget hook before it committed.

### Fixed

- `designing`'s `capture.mjs` keeps a full-page capture wider than the viewport and records its `scrollWidth`, so a page with horizontal overflow reaches the critic instead of blocking visual verification.
- `designing` passes `--label baseline`, `post-build` or `final` to every capture, so the three checkpoints no longer overwrite each other, and `design-discovery` and `design-critic` read the `<label>-<w>x<h>-fullpage.png` files `capture.mjs` writes.
- `designing`'s `direction.mjs --check` accepts a contract at any position whose seed `<seed>:<n>` and axes match dealing index `n`, so `recommended.json`, `chosen.json` and a finalist set that skips an index no longer fail on seed-mismatch.
- `direction.mjs` exits 1 on any report that is not `ok`, and `--select` takes `--space` (and `--candidates`) and refuses a contract `--check` rejects instead of freezing it.
- `designing`'s `context.mjs` parses a flow list such as `source_anchors: [a, b]`, reports `unknown` when no anchor names a file to compare, and carries the front matter's `status` as `approval_status`.

## 0.35.1 - 2026-09-24

### Changed

- `CLAUDE.md` keeps the checkout exo loads from on `main`: every change runs in worktree-isolated subagents, lands through one integration worktree under `.worktrees/` and a direct push to `main` with no pull request, and ends with `/reload-plugins` instead of a cache update.
- `CLAUDE.md` says one thing about landing: a change lands by a direct push to `main`, its Highlights go in the commit that records it, the push cuts the release, and the opening tidy also deletes local branches whose upstream is gone, so squash-merged branches no longer linger.

### Fixed

- The `memory` nudge hook fires on Dutch corrections such as "nee, …", "dat klopt niet" and "eigenlijk …", and still stays quiet on an ordinary Dutch sentence.
- `memory` renders only live lines into `memory.md`, keeps superseded and dropped history in `memory.json` outside the 2,000-byte budget, and adds `retire --claim <n>`, so repeated supersedes no longer refuse every write.
- `debug` writes its repro log to `$(git rev-parse --git-dir)/debug-repro.log`, so it works in a linked worktree where `.git` is a file.
- `shipping`'s `wait-checks.mjs` writes gh's output to `<git-dir>/exo/wait-checks.log` and prints one line, `checks: pass`, `checks: fail <names>`, `checks: timeout` or `checks: none`, instead of the table gh reprints every 10 seconds.
- `wait-checks.mjs` exits 3 on a gh failure such as auth, network or a missing pull request, which `shipping` no longer reads as a red check; 0, 1 and 124 keep their meaning.
- The delegate budget hook tells a delegate past the soft limit to commit what is green, and past the hard limit still lets a lone `git add`, `git commit`, `git status` or `git diff --stat` run, so a delegate no longer strands finished work it cannot commit.
- A behavioral test pins `wait-checks.mjs` exiting 3 on a GitHub API auth or connection error; the earlier test imported `GH_ERROR_EXIT` and could not fail on the exit code alone.

## 0.35.0 - 2026-09-24

### Added

- A `PreToolUse` hook holds every delegate to a context budget measured from its own transcript: past 40k tokens it says to read nothing new and write the report, and past 70k tokens or 60 tool calls it denies every tool but `Edit`, `Write` and task updates, with limits per agent type in `skills/savings/assets/delegate-budgets.json` and a `Budget:` line in the dispatch outranking them; `exo:implementer` stops on that hook instead of its own estimate of 100 tool calls or 120k context.

## 0.34.4 - 2026-09-24

### Changed

- `implementing`'s `next-task.mjs` writes each wave task's frame and section to a brief file under the run checkout's git directory and prints only its `Design:`, `Run:`, drift and `Brief:` lines, so the dispatch to `exo:implementer` names that path instead of pasting the task twice into the session, except a dispatch with worktree isolation, which still carries the brief's content because that delegate reads nothing outside its worktree; the brief drops `Conventions:` and the implementer no longer rereads the root `CLAUDE.md` it already loaded.

## 0.34.3 - 2026-09-24

### Fixed

- The read guard refuses a Read of a large file with only an `offset` or a `limit` above the cap as it refuses one without bounds, and the repeat guard lets the same command run again after a successful `Edit` or `Write` by the same reader, booked in a `PostToolUse` hook so a failed edit resets nothing, so a red, green and final run of one test is no longer denied.

## 0.34.2 - 2026-09-24

### Fixed

- `implementing`'s scripts stop with exit 1 and the reason on a plan with a dependency cycle, a dependency on a missing task, a duplicate task number or a task heading that does not parse, instead of reporting every task landed; they read `Task 1, 2` and `Tasks 1 and 2` as both tasks, count only commits since the default branch as landed, refuse a commit whose subject bash changed, and find methods, getters, TypeScript types, Go methods and `pub(crate)` Rust functions as `Modify:` regions.

## 0.34.1 - 2026-09-23

### Fixed

- `skills-tool`'s pressure-scenarios reference starts every case as the ordinary task and adds pressure only when the run without the skill passes it; it no longer tells a case to cut the model off, fix its tool budget or insist the situation is real, a framing the live API refused as `reasoning_extraction`.

## 0.34.0 - 2026-09-23

### Highlights

- **Stop first.** The finish question after every stage now recommends stopping, with the command to run after a clear in that line, because the brief, plan and branch are on disk and a clear loses nothing the next stage reads.

### Added

- `implementing` reads the landed set, the next task or wave, its section, its frame fields and the drift of its `Modify:` regions from `scripts/next-task.mjs`, and lands a green task through `scripts/land-task.mjs`, which runs the task's `Commit:` block and checks its `Plan-task:` trailer, so the session extracts, checks and commits nothing by hand.

### Changed

- The next-stage question lists Stop first and recommends it after every stage; this session is the second option.
- `implementing` runs at `medium` effort; the implementer agent and both branch reviewers keep their pins, and the next-stage model table says so.
- `planning` sends discovery to `exo:explorer` by default and reads at most eight files directly before the plan is first written.
- The README and CONTRIBUTING say that the read guard hooks `Read` only and covers no file content read through Bash.

## 0.33.0 - 2026-09-23

### Added

- Plan builds run on the new `exo:implementer` agent, pinned to `sonnet` at `high` effort whatever the session's effort; the three agents that load no `CLAUDE.md` carry the rule against deleting past a blocked state; and a plan slices a cross-layer change into tasks that each run one path through every layer.

## 0.32.0 - 2026-09-23

### Added

- `node verify/skill-graph.mjs` answers where a skill section starts and ends, what points at a file and which strings a check pins to a doc, so an edit reads a line range instead of a whole file.

### Changed

- Skill budgets are stricter: a skill body fails over 2,500 tokens (`using-exo` over 1,000), a description over 375 characters, and a reference that names another reference or runs past 100 lines without a contents list; skills not yet trimmed are listed in `PENDING_TRIM`.
- `skills-tool` states the new size aims and ceilings once, pinned to `verify/budgets.mjs`, and moves the one-topic reference rule from its new-skill template into the body every edit reads.
- The `exo settings:` line now carries the active `replies` rule from `skills/settings/schema.json`, so `using-exo` no longer states it.
- `using-exo` injects about 1,000 tokens instead of 2,300: the question format and the next-stage table move to `references/question.md` and `references/next-stage.md`, which the skills that ask or end a stage list in their tables, and the restatement repeats `# Closing` in place of the next-stage table.
- `shaping` loads about 2,450 tokens instead of 3,460: reopening a stored brief, the brief's sections and the issue path move to `references/stored-brief.md`, `references/brief.md` and `references/brief-in-an-issue.md`, its description drops the two-file and named-change exclusions, and the verifier holds the interview page's states, closers and option count to `question-page.mjs`.
- `designing`: the body drops to about 2,470 tokens and the description to 363 characters; the sketch recipe, the settled-identity evidence and the discovery dispatch inputs move into the `phase-build`, `intake` and `phase-detail` references, every reference names a sibling by its topic instead of its file, and `motion.md` and `visual-critique.md` open with a linked contents list.
- `designing`: the check-ui tell and always-blocking lists, the capture viewports and the sketch-tab and picker labels live in `skills/designing/assets/`, its scripts and `shaping`'s question page read them there, and the verifier fails when a doc list drops a name its asset holds.
- `implementing-batch` loads about 2,200 tokens instead of 3,100: the test-first cycle moves to `references/test-first.md`, the steps drop repeats of the right-sizing ladder and the command-output rule that `using-exo` injects, the task list's states stay in the skill, and the table gains the `using-exo` question reference.
- `implementing` loads about 2,000 tokens instead of 2,500: the `Design:` routing moves to `references/design-tasks.md`, which step 5 opens only for a task with a `Design:` line, and the steps drop what `references/workspace.md` and the prompt files already say. `pick-reviewer.mjs` exports its five-file and 200-line limits, and the verifier pins every doc copy of that threshold to them.
- `settings` loads about 440 fewer tokens: the setup walk's rounds move into `references/setup-map.md`, now titled "Setup walk" with a contents list, the body names "a key `show` lists" instead of repeating the schema keys, and its table lists using-exo's question reference.
- `planning` loads about 350 fewer tokens: its body drops sentences plan-spec, implementing and using-exo's next-stage reference already own, its description is 298 characters, plan-spec names no other skill's file, the example plan opens with a contents list, and `deepen` lists implementing-batch's test-design reference for its plan mode.
- `debug` loads about 250 fewer tokens: its description is 310 characters, the performance branch rides on the performance row, and the loop keeps its seven steps in fewer words.
- `deepen` says its scope, terms, audit and modes in fewer words, reads the next-stage table and the question shape from the `using-exo` references, and its description drops from 371 to 285 characters.
- `shipping` states its routes in fewer words, reads the question shape from the `using-exo` reference, and the verifier pins the 20-minute wait and exit 124 it states to the constants `wait-checks.mjs` exports.
- `memory` reads its attestation count from one `ATTESTATIONS_REQUIRED` constant that the verifier pins its docs to, and says "attested in 2 sessions" where it said "attested twice"; the `prototyping` and `memory` descriptions drop to 299 and 268 characters.
- `savings`: the skill relays the retention window and the token ratio from the report instead of restating them; `CHARACTERS_PER_TOKEN` joins `SESSION_RETENTION_DAYS` and `DEFAULT_GUARD_LINES` as an export of `scripts/record.mjs`, the shared-contracts check pins README.md, CONTRIBUTING.md, `docs/skills/savings.md` and the settings setup map to those three constants, and the usage-count keys and guard kinds each have one owner.
- `handoff` and `research`: shorter descriptions in the "Use when… Not for…" form (220 and 279 characters), and `handoff` and `issuing` join the skills the full verifier checks, so their structure, links and reference tables are checked like every other skill's.

### Fixed

- The check-ui test covers all 19 decorative tells `visual-critique.md` lists, `invented-content` included (#86), and README and CONTRIBUTING give `exo:design-critic` the `medium` effort and 12-turn limit its agent file sets.
- The README settings table lists the `context` setting.

## 0.31.0 - 2026-09-23

### Added

- `benchmarks/sweep.mjs`: a local, opt-in sweep that runs every review, build, plan and whole-flow cell as its own `claude -p` process with a named model and effort, records defects found, false alarms, tokens and wall time per cell, and writes the reviewer's false-alarm rate and the winning plan cell to a dated results file; `skills-tool` now names the model and effort on every pressure-scenario run.

## 0.30.0 - 2026-09-23

### Added

- `designing`: `scripts/direction.mjs --check` rejects a direction as `template-kit` when a palette anchor is a purple, a cream, or a neon beside a near-black anchor, the kits `scripts/check-ui.mjs` flags after the build, unless that anchor's evidence is of kind `brief` or `repository`; an anchor may be written as `{ "color", "evidence" }` to carry that evidence, and a plain color string stays valid.
- `designing`: `scripts/check-ui.mjs` reports `invented-content` at `potential` confidence for a stock person name, a sample company name, a round placeholder price, and an unsourced user count, rating or testimonial attribution.

### Changed

- `designing`: when no stage called it, a build runs the repository's own type-check, lint and test commands for the touched files before `scripts/check-ui.mjs`, and the QA checks line reports their result; a failure in an untouched file is reported, not chased.
- `designing`: the piece path's load list and post-build pair move from `SKILL.md` into `## The piece path` of `references/phase-build.md`, and a piece with a settled identity reads `references/implementation.md` without `## Tokens and palette derivation` unless it adds a role token the repository lacks.
- `designing`: the rule that a run starts Build in the turn the direction is picked moves into `references/phase-direction.md`, the copy of a handed direction to `$RUN/contract-selected.json` into rung 2 of `## Route`, and a plan's `Contract:` record into the planning bullet of `references/intake.md`.
- `designing`: `SKILL.md` holds one numbered `## The loop` of five steps in place of `## Intake` and the five phase sections and calls the `exo:design-critic` agent the critic throughout, so every run loads about 1890 words of it instead of 2274.
- `designing`: `## The fault contract` in `references/visual-critique.md` shows one complete five-line fault in place of the label definitions.
- `designing`: `references/motion.md` opens with a list of its sections.

## 0.29.1 - 2026-09-23

### Changed

- `CLAUDE.md`: a skill, agent, rule, hook or `CLAUDE.md` edit in this repository also follows `~/.claude/rules/instruction-style.md` when that file exists, because its `paths` trigger never loads it on a create.

## 0.29.0 - 2026-09-23

### Added

- `designing`: `scripts/check-ui.mjs` reports eight more named template defaults as `potential` findings with file and line: `purple-palette`, `neon-on-dark`, `cream-ground`, `tinted-glow` (a zero-offset halo blurred 4px or more at any saturation, or an offset shadow blurred 12px or more in a clearly saturated color, oklch chroma 0.08 or more in any notation, so an ink-tinted shadow such as `rgba(15, 23, 42, 0.12)` stays quiet), `pill-button`, `bounce-easing`, `card-entrance` and `monospace-label`.

### Changed

- `designing`: `scripts/check-ui.mjs` reports `left-accent-card` as `edge-accent-card`, a stripe on any one card edge; rename `left-accent-card` to `edge-accent-card` in `docs/design/check-ui-ignore.json`, where a `--baseline` run now warns about each entry whose type the script does not report.

### Fixed

- `designing`: `scripts/check-ui.mjs` matches a `docs/design/check-ui-ignore.json` entry against a rule-level finding such as `body (styles.css:4)` by its file, warns about an entry whose `file` still names the rule and its line, and a `--baseline` comparison keeps that finding as predating when lines above it shift.

## 0.28.0 - 2026-09-22

### Added

- `designing`: `scripts/check-ui.mjs` skips matches inside code comments, takes `--baseline <file>` to report a `comparison` of new, predating, ignored and blocking findings, and reads user-confirmed false positives from `docs/design/check-ui-ignore.json`; a run checks its baseline before Build, reports the design finished only when that comparison blocks nothing, and quotes the checker's own counts.

## 0.27.0 - 2026-09-22

### Added

- `designing`: `scripts/direction.mjs --shape` prints the script's header, the `space.json` and contract shape, and nothing else; Phase 2 names that call instead of sending the session into the script to find the shape.

### Changed

- `designing` states its after-compaction resume rule (`$RUN` files, `contract-selected.json`, `renders/`, docs/design/DESIGN.md) above `## Size the request`, where a compaction's re-injection keeps it.
- `designing` `references/internationalization.md` opens with its load condition, so a run that loads it on a single-locale product with no translation machinery and no right-to-left audience applies nothing from it.
- `designing`'s reduced-motion rule and exit rule are worded so a `sonnet` builder applies them: only the transition goes behind the media query, never the state change; an edge mask stays static; an element that appears and disappears (panel, menu, dialog, toast) exits on its own shorter duration and curve, while hover and press feedback may use one transition both ways.

### Removed

- `designing` `references/phase-critique.md`: its render budget, three checkpoints, one-reviewer cap, 12-call cap and no-browser-tool rule now live in `references/phase-detail.md` `## The critique dispatch`, and SKILL.md's Phase 1 no longer repeats the three-facts sentence.

## 0.26.0 - 2026-09-22

### Added

- The `context` setting, in thousands of tokens and `80` by default, sets how large a session's context grows before a skill's next phase moves to a fresh context; `settings.mjs` shows, gets and sets it, `/exo:settings` asks it as a whole number, and a stored value that is not a whole number of at least 1 reads as the default.
- A PostToolUse hook on `TaskUpdate`, `skills/savings/scripts/context-watch.mjs`, adds one `exo: context <n>k tokens, past <threshold>k` line when a completed task finds the main session's context past the `context` setting, and prints nothing under it, inside a delegate or on a fault.

### Changed

- The session hook puts the handoff and memory pointers and the settings line before the `using-exo` text and names a pointer's file from the repository root; when the context would pass 10,000 characters it cuts the tail of that text, never a pointer.
- `using-exo` `# Context` carries the context rule, which sends the phase after an `exo: context` line to a delegate or, when it asks the user, to a handoff, and the scope rule, which limits a phase to the artifacts and references its skill names; `implementing` drops its 45% status-line rule and points there.
- `designing` Phase 1 of a full or bounded redesign runs in the new `exo:design-discovery` agent on `sonnet` at `high`, which writes `$RUN/inventory.md` and `$RUN/files.md` and returns at most 20 lines, and Phase 5 QA runs in a `sonnet` delegate once an `exo: context` line has appeared.

## 0.25.0 - 2026-09-22

### Added

- The `exo:branch-reviewer-deep` agent, the branch review at `high` effort for a branch above five changed files or 200 changed lines, with the same body as `exo:branch-reviewer`, which now runs at `medium` on a branch within both numbers; `implementing` picks between the two by running `skills/implementing/scripts/pick-reviewer.mjs` against `git diff --shortstat`, because every review ran at `high` whatever the size of the change, and `tests/agents.test.mjs` keeps the two bodies identical. The script takes a `--reviewer <name>` override for a reviewer the user names directly; a remark about budget, a deadline or how the diff reads is not a named reviewer and does not move the pick.

### Changed

- The branch review file `branch-review.md` lists every confirmed finding instead of the first twelve; the cap of twelve now applies only to the report returned to the session, which names the file for the rest, because a thirteenth real defect was dropped without a trace.

## 0.24.3 - 2026-09-22

### Changed

- `/exo:savings` and the status line segment show only the tokens the read guard kept out of context, estimated at 3.5 characters per token from the bytes it booked and split into big-file and repeated reads; cost, calls, wall time, byte figures, the `Saved` and `Skills` lines and the context band leave the report and the segment, the segment no longer reads the transcript, and the routing book with its three hooks, `routing.mjs` and its test is gone.

## 0.24.2 - 2026-09-22

### Fixed

- `implementing` dispatches a wave's builds with the harness's worktree isolation when it has one, because a session isolated in a worktree refused every command its delegates ran in sibling `-task-` folders.

## 0.24.1 - 2026-09-22

### Highlights

- **`shaping` asks every ready decision in one round of up to four numbered questions, instead of one question per message.**

### Changed

- `shaping` grills in rounds whose question numbers run on, confirms every decision at a checkpoint, and writes a brief that adds Problem, Out of scope and Proof; `using-exo` allows the round.
- The interview page shows the whole round as cards with numbered options, the earlier rounds with each choice, the recommendation and a Change control, and the decision tree; its answer is one object per round.
- The sketch tab sends a form's fields with the click, and the settings walk asks every open setting in one round.

## 0.24.0 - 2026-09-22

### Highlights

- **exo no longer ships paid evals: `npm run check` and the unit tests are the only gate.**

### Changed

- A run on a branch whose pull request is already merged asks the workspace question as on the default branch, and Branch starts from `origin/main`.
- `shipping` runs `gh pr update-branch` on `BEHIND` and gates again; on `DIRTY` it asks whether to resolve the conflicts or stop.

### Removed

- The paid evals: `evals/`, `eval-case.mjs`, `eval-reasons.mjs`, their tests and npm scripts, and the `yaml` dependency only they used.

## 0.23.0 - 2026-09-22

### Highlights

- **A finished run ships in one answer: pick `PR + merge` and exo pushes, opens the pull request, waits for the checks and merges once the GitHub API reads it clean.**
- **`issuing` starts on a plain request to file an issue, with no slash command and no approval step.**
- **Three skills are gone: `setup` is `/exo:settings` with no argument, `implementing-test-first` is a route inside `implementing-batch`, and `merge-prs` is part of the new `shipping`.**

### Added

- `shipping` owns the finish of every code-changing run: the finish question, the push, the pull request, a check wait bounded at 20 minutes, and the merge behind the API gates `merge-prs` held.
- `implementing-batch` runs a test-first route at any file count, quoting a red run before each production edit.

### Changed

- The finish question on a branch offers PR + merge, Open PR, Push and Keep local, and the pick runs to its end; a red check, a failed gate or a timeout leaves the pull request open with the reason.
- `issuing` is model-invocable: a plain request creates the issues and reports their URLs, and it asks only when it proposes a split.
- `/exo:settings` with no argument walks every setting, and it now switches the savings counter, the read guard and its line limit.
- `savings` only reports; its switch line points at `/exo:settings counter off`.
- `implementing` runs every plan and builds one of three tasks or fewer in its own session; `planning` hands over to `implementing` only.

### Removed

- `setup`, folded into `settings`.
- `implementing-test-first`, folded into `implementing-batch`.
- `merge-prs`, folded into `shipping`.

## 0.22.2 - 2026-09-21

### Changed

- `/exo:settings` opens on an overview the script prints, with each setting's value, layer, options and overridden layers, and changes a value through numbered questions for the setting, the value and the layer.

## 0.22.1 - 2026-09-21

### Fixed

- `benchmarks/map-spike.mjs` holds the dispatch mark at a fixed 10,000 tokens instead of deriving it from the map's default cap, so raising the cap no longer moves a mark committed before the measurement.

## 0.22.0 - 2026-09-21

### Added

- `/exo:setup` walks through every exo setting on the question page, one click each with keeping first, and writes only the changed values after a review.
- `savings.mjs guard` prints the read guard's state and line limit, and `guard on|off` switches the guard alone.

### Changed

- `eval-case.mjs` grants the three read-only commands `/exo:setup` runs on load, so a setup case no longer ends on a permission denial before its first turn.

### Fixed

- `settings.mjs show` and `context` show the project and local layers when the harness settings file cannot be read, and name that file, instead of failing, so `/exo:setup` loads under an OS sandbox that denies the config directory.

## 0.21.1 - 2026-09-21

### Changed

- `eval-case.mjs` passes `--max-cost-usd 5` to every runner process and reports a runner the ceiling stopped as a stopped run with no verdict, so the ceiling no longer depends on remembering the flag.
- `tests/evals.test.mjs` fails a case without `max_turns` or `timeout_seconds`; the 25 cases older than the rule sit in a list that may only shrink.
- `eval-case.mjs` takes `--model <subject model>`, passes it to every runner process and writes it to the merged result as `suite.subjectModel`, `runner default` when none is named, so a result says which model it measured.
- `eval-case.mjs` passes `--scaffold` for a case whose `case.yaml` names a `context.scaffold_script`, and for no other case, because a run starts in an empty working directory and `context.add_dirs` copies nothing into it.

### Fixed

- The session hook keeps its whole output under the 10,000 characters a hook string may hold: on a long path it leaves out the memory pointer, then the handoff pointer, and says so on stderr, where a longer string reached the model as a 2,000-character preview without the rules.

## 0.21.0 - 2026-09-20

### Highlights

**Every exo skill now declares which side invokes it, and `README.md` lists the model-invoked and the user-invoked group separately.** **`shaping` now interviews from a decision map until nothing is open, reopens the brief you already have instead of filing a second issue, and can ask on a browser page with every decision in view.** **A `derivation` check fails the build on a name exo does not own and on a third-party notice file, so PolyForm Noncommercial 1.0.0 stays the whole licence.**

### Added

- A `derivation` verifier check fails the build when a name exo does not own reaches a shipped file, or when a third-party notice file appears at the repository root. The names are held base64-encoded inside the check, because a plaintext list would itself be the text it forbids.
- `skills/implementing-test-first/SKILL.md`: name the observable boundaries the tests read and get them confirmed before the first test, then one behavior per cycle, failing test first, least code second, and restructuring held until the last cycle, reading the test-design reference instead of restating it.
- `skills/prototyping/SKILL.md`: write the open question down, send a question about a look to `designing`, build a throwaway no production path can reach, park it on a `temp/<name>` branch that is never merged, and build the decision fresh.
- `ABOUT.md` names exo's domain words and the synonym each one replaces, including the savings record and its counter.
- A human-facing page per skill under `docs/skills/`, the one part of `docs/` that ships.
- An `interview` setting, `chat` or `page`. With `page`, `shaping` asks in one browser tab that shows every decision, open and closed, and takes each answer as a click; a single question and a machine without a browser stay in the conversation.
- The status line segment closes on the context the session holds, such as `context 120k · edge`, and says when to write a handoff and clear.
- A `skill body budgets` check fails any `SKILL.md` over 15,000 bytes.
- `skills/drafts/` stages a skill that is written but not loaded. A plugin loader discovers `skills/<name>/SKILL.md` only and does not recurse, so nothing staged there is listed, invoked, or counted against the description budget; `README.md` says what promotion requires.

### Changed

- The right-sizing ladder in `skills/using-exo/SKILL.md` opens on what it is for: low complexity through reuse, no second copy of code this repository already holds, and the tokens and the time that saves as the result it is measured against.
- `skills/shaping/SKILL.md` runs its interview from a decision map: no budget ends it and no guess closes a decision. A map of three or more open decisions stands above the first question and shows beside each one what it waits on. Every question carries its place, one plain sentence, what the answer changes, and the options; the brief names for every decision who closed it; and new wishes for work that already has a brief, an issue or a plan reopen that brief and edit it where it stands. Both modes now write with the words of the repository's own vocabulary file and record a word they settle as a decision.
- `skills/skills-tool/references/form-by-failure.md` is replaced by `references/where-a-fix-lives.md`, which places a fix in the cheapest home that stops the mistake, and the two columns of every `## Red flags` table are now `The excuse` and `What holds`.
- The flag grammar and the page chrome that `designing`'s scripts and `shaping`'s question page share live in `lib/script-flags.mjs` and `lib/page-chrome.mjs`, and a test fails an import alias that points into a skill folder.
- `README.md` lists the skills in two groups, model-invoked and user-invoked, and covers `handoff` and `memory`, which it had never listed.
- `skills/designing/SKILL.md` keeps its routing, its reference table and its judgment; its asking rules, its symptom list, its run-directory contract and its phase detail moved into `skills/designing/references/`, where the phase that acts on them opens them.

### Fixed

- `memory.mjs` fails `render`, `book` and `propose` in one line on a state file that does not parse, where it printed a stack.
- The session hook's three reset calls no longer share the stdout that carries its JSON.
- `skills/implementing/SKILL.md` names `../issuing/references/fields.md`, which its finishing reference sends the reader to.

## 0.20.2 - 2026-09-20

### Fixed

- `shaping`'s `specs=issues` path sets the project fields the repository defines again. The guard 0.20.1 added read as "set no project field", so a spec issue landed with its priority, size and estimate empty; it now names only what it may not create, a label, a type or a milestone the repository does not already define, and sets every field it does. The Spec sections in `skills/issuing/references/fields.md` name which part of a brief each one carries, so `shaping` no longer repeats that mapping.

## 0.20.1 - 2026-09-20

### Changed

- One standard now decides every issue and pull request exo creates. `skills/issuing/references/fields.md` holds the field vocabulary, how priority, size and estimate are read off the body, the two body shapes, Spec for a brief or feature work and Report for a bug, a regression, a chore or a documentation fix, and the pull request's own labels, milestone, project fields and `Closes #<n>` line, which it had carried for no pull request before. `issuing`, `shaping`'s `specs=issues` path and `implementing`'s finishing reference read that one file instead of each holding a copy, and this repository's issue and pull-request templates carry the same section names, so an item a person files and one exo files read alike.

## 0.20.0 - 2026-09-20

### Added

- `planning` builds a map of the repository with `skills/planning/scripts/repo-map.mjs` and reads it before it dispatches `exo:explorer`, so a cold session sees where a kind of thing lives before it pays for a search, and the generator's default cap rises from 4,000 to 12,000 bytes, the size at which this repository keeps the exported names of most of its JavaScript and TypeScript files.

### Changed

- `CLAUDE.md` has a session in this repository install a landed release itself: after the release workflow succeeds it updates the marketplace and the plugin, then clears the cached exo versions no session uses, leaving the user only the restart.
- `planning` reads the repository map as its own step before the dispatch, and ties the dispatch to it: the explorer is asked only for what the map left unresolved, and a path the map already names is confirmed by reading its range in the planning session instead.
- The read guard lets an unbounded read of the repository map through: `<git common dir>/exo/map.md` is generated, capped where it is written and printed to be read whole. The exemption reaches that one path and the cap alone: a map.md anywhere else stays capped, and a second read of the map in one context window is still refused as unchanged.
- `eval-reasons.mjs` can leave a grader out of a case's `GATE` line through `NON_GATING_GRADERS`, which names it on that line and keeps it in the pass-rate table, and `planning-reads-the-repository-map` now gates on its `runs-the-map-before-the-dispatch` regex grader alone.

## 0.19.0 - 2026-09-20

### Added

- `node skills/planning/scripts/repo-map.mjs` builds a map of the repository it runs in: every tracked path, the exported names of its JavaScript and TypeScript files and the `scripts`, `bin`, `main` and `exports` of a `package.json`, with no file body. It writes `<git common dir>/exo/map.md`, holds it to 4,000 bytes by leaving a folder that does not fit as one line with its file count, and rebuilds it only after a commit changed a tracked path. No skill calls it yet and no session pays for it: `node benchmarks/map-spike.mjs <exo> <second repository> --verdict "<sentence>"` first measures what the map keeps against what `exo:explorer` dispatches cost, and holds the figures against a pass mark the script fixes beforehand.

## 0.18.0 - 2026-09-19

### Added

- A prompt that looks like a correction now nudges the session to book it: a `UserPromptSubmit` hook matches a list of correction markers, injects one sentence naming the `memory.mjs book` command, and logs every fire with the marker that matched. `node skills/memory/scripts/nudge.mjs stats --cwd .` prints fires, bookings and the hit rate, so the marker list is tuned on real prompts. `/exo:memory` is unchanged and still books what the markers miss.
- That booking shows no permission prompt and needs no setup: a `PreToolUse` hook on `Bash` allows the one `memory.mjs book` command the nudge prints, with plain quoted values, and stays silent on every other command. A user's own deny or ask rule still wins, and a quote holding a double quote, dollar sign, backtick or backslash gets the normal prompt.

## 0.17.0 - 2026-09-19

### Highlights

- **A repository now remembers what you corrected, and every session reads it.** Run `/exo:memory` when a session gets a repository fact wrong; the claim lands in a file at `<git common dir>/exo/memory.md` that the session hook points every later session at.
- **Nothing is remembered on one session's word.** A claim is proposed to you only once two separate sessions have booked it, and it is written only after you approve it.
- **The file cannot grow until it costs more than it saves.** A write past 2,000 bytes is refused while naming what to retire, a claim already live is refused a second copy, and a line whose files or symbols are gone is dropped.

### Added

- A repository gets a project memory exo writes: `/exo:memory` books a correction with the user's own words, proposes a claim only once two separate sessions have booked it, writes it after the user approves, marks a replaced fact superseded so the file never holds two answers to one question, refuses a second copy of a claim that is already live, refuses a write past the 2,000-byte budget while naming what to retire, and drops a line whose files or symbols are gone. It sits at `<git common dir>/exo/memory.md`, is never committed, and the session hook injects a pointer to it rather than its body.
- The eval case `memory-refuses-one-session`.

### Fixed

- `tests/harness.mjs` no longer aborts a whole test file when a script exits before reading the stdin it is fed: the EPIPE that write raises was uncaught, so it was charged to whichever test was in flight.

## 0.16.0 - 2026-09-18

### Added

- A risky change is built test-first: `skills/implementing-batch/references/test-design.md` defines risky, a risky plan task carries a `Risk:` line and writes its failing test before its code, the implementer and the bug fixer quote the failing output before the edit and the passing output after it, and the branch review reports a risky task that shows neither.
- The eval case `planning-risky-task-goes-red-first`.

## 0.15.0 - 2026-09-18

### Highlights

- **Visual choices arrive as quick sketches in one browser tab.** The tab opens once and stays open, each color, type, spacing or layout question appears in it within about half a minute, one click answers, and a revision lands in the same tab.
- **`shaping` asks what you would notice.** It puts scope, what counts as done, unmentioned cases and what the user sees to you one question at a time, within a budget of about 2, 5 or at most 8, and decides routine choices itself.

### Added

- `skills/designing/scripts/sketch-tab.mjs` serves the newest sketch in a folder to one tab and records each click in `answers.jsonl`: `--serve` runs once per session, `--wait` prints the answer for one sketch, and `references/sketch-tab.md` holds the sketch rules.
- The eval cases `shaping-asks-the-noticeable-decision` and `designing-asks-no-visual-question-in-text`.

### Changed

- `shaping`'s question gate asks every noticeable or costly decision, chosen from the answers so far, shows its place such as `Question 3 of about 5`, and ends every question on **Go**; what go or the budget closes takes its recommended answer under **Decisions I made**.
- `designing` never puts a visual choice to the terminal: it goes to the sketch tab, and when the browser is declined the session decides, states the choice in one line and applies a correction. The offer's second option is now **Decide for me**.
- Full comps through `pick.mjs` are built only when the user asks to see a direction whole, and only the recommended contract is filled before the offer.

## 0.14.2 - 2026-09-18

### Changed

- `eval-case.mjs` no longer defaults to the no-plugin arm: a run without `--arm no-plugin`, `plugin` or `both` exits 1 before any paid run and names the case and the three arms, because a skill-behavior case graded without exo loaded scores 0 and still pays. `npm run eval:savings-report` and its draft pass `--arm no-plugin` themselves.

## 0.14.1 - 2026-09-18

### Changed

- The branch review reports only a correctness fault or a gap against the plan: a naming or formatting nit, a preference, a rename, a refactor and anything only worth having later are left out. The forwarding-abstraction, duplication, failure-handling and test checks stay.
- `implementing` names `/exo:handoff` and a fresh session once the status line's context share passes about 45% inside one task, so the review and the pull request at the tail still have the context they need.
- A wave holds two tasks at most, down from three: two build delegates run in parallel worktrees, and a third ready task waits for the next round.
- `implementing` runs the plan's `## Final verification` itself, in the run's checkout, before it dispatches the branch review, and quotes each command with its result: the review starts only on a green run, and a failing command goes to the bug fixer first.

## 0.14.0 - 2026-09-18

### Added

- `/exo:handoff` saves an unfinished session to `<git-dir>/exo/handoff/<branch>.md`, so a fresh session continues after a clear: goal, current state with the plan task and the uncommitted paths `git status --short` lists, decisions and who made them, files touched, what is proven and by which command, the single next step and the open questions, as pointers rather than pasted content. It overwrites the handoff of that branch, works per worktree, is never committed, and falls back to `~/.claude/exo/handoff/<folder>.md` outside a repository. You start it yourself; nothing else does.
- A session that starts on a branch with a handoff is told the path in one line, to read only when it continues that work and to compare the file's `Written:` commit with the current one.

### Changed

- `planning` no longer fires on the word handoff: it owns plans, `/exo:handoff` owns the live state of an unfinished session. `references/handoff-spec.md` and `references/example-handoff.md` are now `references/plan-spec.md` and `references/example-plan.md`, which is what they always described.
- A plan whose affected paths cross authentication, ownership, secrets, untrusted input, network, file or process execution, cryptography or regulated data loads the security reference `implementing-batch` already uses, and folds its checks into the tasks touching those paths as steps with their own `Run:` and `Expected:`.
- The branch review reads a deleted test, a removed or loosened assertion and an added skip or exclusive marker as a defect, unless the plan named that test a non-goal or asked for the change in a task.
- The `planning` body now states that a plan for a folder that is not a git repository yet writes `Branch: main`; the value sat only in `references/plan-spec.md`, which a session that cannot read it replaced with `Branch: none`.

## 0.13.1 - 2026-09-18

### Changed

- A question stands alone: one a turn, with nothing written, edited or run until the answer arrives. `shaping`'s explore mode leads with the direction it recommends, and the surface question in `designing` lists the surfaces it can see, most recently changed first.
- A green build and a `CLEAN` branch review return their verdict lines instead of the whole report: the task number with `GREEN`, one line per `Run:`, and the report path the caller opens only when it needs the rest. Drift, a failure, `FIXED` and `BLOCKED` still return everything.

## 0.13.0 - 2026-09-18

### Added

- `implementing` builds independent plan tasks together: when a plan's `## Plan basis` carries a `Worktree setup:` line, up to three ready tasks without a `Design:` line each build in a git worktree of their own, their commits land on the run branch in plan order through `git cherry-pick`, one report that is not green discards the whole wave before anything commits, and no worktree outlives the wave. A plan without that line runs one task at a time as before, and `planning` writes the line when at least two tasks do not depend on each other.

## 0.12.0 - 2026-09-18

### Added

- A long session hears the routing rules again: once the transcript has grown 600,000 bytes since they were last injected, the next prompt carries `## Before acting`, `## When several fire` and `## The next stage`, read from `skills/using-exo/SKILL.md` at that moment and locked to 3,242 bytes in `verify/budgets.mjs`. `exo savings off` stops it.

## 0.11.0 - 2026-09-18

### Added

- The repeat guard denies the third identical `Bash` command or `Edit` in one context window with a reason that names the count, so a session that re-runs a failing command changes an input or stops. `repeatGuard: false` in `~/.claude/exo/savings/config.json` switches it off alone, and a clear or a compaction makes it forget.
- The savings record books which skill handled each request and the report gains one `Skills` line naming what fired and how many turns matched none. No request text is stored.

## 0.10.0 - 2026-09-18

### Added

- `verify/budgets.mjs` locks the two always-on budgets to their measured values: the model-invocable description total and the body `hooks/session-start.sh` injects into every session. Growth fails `npm run check` naming the locked number and the new one, shrinking passes, and no check re-locks itself, so raising a lock is a hand edit in the commit that pays for the text.

## 0.9.1 - 2026-09-18

### Changed

- The savings store on disk is named the savings record: `skills/savings/scripts/record.mjs` replaces the old module, its exported names follow, and the retired word is gone from the repository.

## 0.9.0 - 2026-09-18

### Added

- `.github/workflows/release.yml` cuts the release on a merge to `main`: it runs `npm run check`, `npm run bump`, commits `chore(release): <version>`, tags `v<version>` and publishes the GitHub Release from `npm run release-notes`. `npm run release-pending` prints `yes` or `no` so a merge that records nothing under `## Unreleased` is told apart from a failed bump, and `CLAUDE.md` and `CONTRIBUTING.md` name the workflow as the only route that raises a version.

## 0.8.1 - 2026-09-18

### Highlights

- **The design critique got cheaper.** `designing` captures the post-build renders and runs the layout checks itself, and dispatches `design-critic` only to judge them, on `medium` effort within 12 turns.
- **A visual change no longer routes by file count.** `designing` owns the turn at any file count, `shaping` goes first when the surface data is undecided, and `implementing-batch` owns it when non-visual behavior is added.

### Changed

- `designing` Phase 4 captures the post-build pair and runs the layout checks itself and dispatches `design-critic` only to judge them, on `medium` effort within 12 turns; faults now cap at four and each names the file and selector its repair edits. `## Size the request` opens with the rule that decides the entry for a visual change: this skill owns the turn at any file count, `shaping` goes first when the surface's data is undecided, and `implementing-batch` owns it when non-visual behavior is added. `implementation.md` requires one styling mechanism per surface and `visual-direction.md` derives the reference set from evidence the session can open.

## 0.8.0 - 2026-09-18

### Highlights

- **Every exo question now has one shape.** Options are numbered `1.`, `2.`, `3.` with the recommended one first, and you answer by typing a digit.
- **exo replies in your language.** Every reply, report and question follows the language of your latest message, or of the plan a session opens on.
- **A plan can start a folder that is not a repository yet.** `implementing` runs `git init -b main` itself instead of stopping to ask.

### Added

- `using-exo` writes every reply, report and question in the language of the user's latest message, or of the plan when a session opens on one; the eval `using-exo-replies-in-the-users-language` covers both.
- `eval-reasons.mjs` ends on one `GATE` line per arm: `PASS` when no grader failed more than one run, `DISPUTED` when only verdicts the reasoning judge reversed broke it, `FAIL` otherwise, and `NONE` for a draft or under three runs. A plan gates on that line instead of a count such as `(3/3)`.
- `tests/evals.test.mjs` fails a case without a free grader and an llm criterion that words layout, such as `ends on` or `on their own lines`; the cases and graders older than the rule sit in two lists that only shrink.

### Changed

- A decision made on the user's behalf sits above the options or is dropped when the turn ends on a question, so nothing follows the options.
- `designing-offers-the-preview` asks for the offer message last and checks that the answer ends on its two numbered options with a regex grader; the judge had read the same ending both ways.
- `planning-plans-a-new-folder`, `implementing-inits-a-new-folder` and `using-exo-closing-line` check their layout and literals with regex graders, and their llm criteria keep only what needs judgment; the `implementing` criterion no longer asks a session without a checkout to execute a command.
- The three cases that gate a plan on three runs carry `runs: 5`, because a coin flip passes two of three runs half the time.
- `CONTRIBUTING.md` holds the measured judge noise, what a judge may grade and the gate; `CLAUDE.md` names the three rules a session gets wrong without them.
- `CLAUDE.md` is rebuilt around commands and hard rules, and adds a section on eval cost that names the cheap path: one case per run, a draft before a verdict, `--arm both` as the exception, `timeout_seconds` per case, free graders first and a `--max-cost-usd` ceiling.
- A GitHub Release is titled `v<version>`, and its notes group changes under New, Improved, Fixed and Removed, list the pull requests since the previous tag and end on a link to every commit since that tag.
- The full verifier checks the `settings` skill: `verify/budgets.mjs` lists it and `verify/checks/reference-tables.mjs` holds its empty reference-owner contract.
- `configDirectory()` lives in `lib/config-directory.mjs`, imported as `#config-directory`, so no skill script imports from another skill's folder.
- Every exo question numbers its options `1.`, `2.`, `3.`, puts the recommended option first as `1. **Label (Recommended)**`, the next stage included, and keeps each option to a few words.
- The workspace, finish and `settings` questions use that shape, and a repository that commits on its default branch puts the current branch first.
- The seven eval graders that check a question expect `1.` numbering with the recommended option first and its label in bold.
- `designing` states the preview's price, then offers it as two numbered options with the preview recommended.

### Fixed

- A plan for a folder that is not a git repository yet runs end to end: the plan leaves the init to the executor, and `implementing` runs `git init -b main` in a folder that holds only the plan's `docs/`. Both rules sit in the skill bodies rather than in a reference alone, so a run that never opens the reference still follows them.
- A decision line in a report names the choice and its cost, never why it was chosen.
- `eval-reasons.mjs` no longer exits 1 on a run without an llm verdict, so a case graded by free graders alone, or one whose every run errored, still ends `eval-case.mjs` on its gate.

## 0.7.0 - 2026-09-17

### Highlights

- **Three helpers are now plugin agents.** `exo:explorer`, `exo:branch-reviewer` and `exo:design-critic` pin their own model, effort, tools and turn limit.
- **The design critique can no longer run away.** It stops at 30 turns, and a critic that returns without its faults file is resumed instead of started again.
- **`designing` keeps file searches out of your session.** Phase 1 discovery goes to the explorer when the request names no files.

### Added

- The `exo:explorer` agent searches code on `haiku` with read-only tools and a 20-turn limit, and the `exo:branch-reviewer` agent reviews a finished plan branch on `opus` at `high` effort, so the session no longer pastes their prompts into every dispatch.
- The `exo:design-critic` agent runs the post-build design critique on `opus` at `high` effort with a 30-turn limit, which a `general-purpose` dispatch could not pin.
- `tests/agents.test.mjs` checks every agent file without dispatching one: supported frontmatter keys, no effort on `haiku`, a turn budget equal to `maxTurns`, script flags that exist and a dispatching skill for each agent.

### Changed

- `implementing-batch` sends discovery to the explorer only when it spans several files or a direct search failed.
- The explorer groups callers and tests, ends a longer report on a `Count:` line, and returns locations only when asked for a fix; the branch reviewer weighs each finding as `defect`, `hazard` or `question`, in file order.
- `skills/implementing/plan-author-prompt.md` is now `drift-repairer-prompt.md`, named for what it does: it repairs the one task that reported `PLAN DRIFT`.
- `designing` sends Phase 1 file discovery to the explorer when the request names no files, and resumes a critic that returned without its faults file instead of dispatching a second one.
- The explorer and the design critic start without the CLAUDE.md files, and the explorer reports only locations a tool result showed it, batches independent searches in one turn and carries a worked report.

### Removed

- `skills/designing/critic-prompt.md`, replaced by the `exo:design-critic` agent.
- `skills/research/scout-prompt.md` and `skills/implementing/branch-reviewer-prompt.md`, replaced by the two agents.

## 0.6.0 - 2026-09-17

### Highlights

- **Replies are tight by default.** The new `replies` setting drops preamble, recap and filler, and `standard` brings full prose back.
- **`/exo:savings` fits in five lines.** It prints cost, refused reads and that the saving is not measured, with no tables.
- **exo spends fewer tokens per session.** The injected rules are a sixth shorter, and every delegate report is capped in lines.

### Added

- The `replies` setting, `tight` by default, drops preamble, recap and filler from replies while code, paths, errors and warnings stay whole; `standard` restores full prose.

### Changed

- Every delegate prompt caps its report in lines and `npm run check` fails on one that does not; the scout returns one line per location, and the branch reviewer one line per finding.
- The rules injected into every session are about a sixth shorter and now state how replies follow the `replies` setting and that long command output goes to a log.
- `/exo:savings` prints five lines, cost, refused reads and that the saving is not measured, instead of a title box, two tables and explanations.

## 0.5.0 - 2026-09-17

### Highlights

- **`/exo:savings` is now a cost report.** It leads with what exo cost, lists the reads the guard refused, and says plainly that the saving is not measured.
- **The internal bookkeeping word is gone from everything you read.** The status line reads `exo cost $0.04 · 2m · 2 reads refused`, and the guard's big-file limit is a setting.
- **Every file is exo's own work.** The skills are rewritten in exo's own words, the third-party notices are removed, and the README is shorter.

### Added

- The `designing-distinct-direction` eval checks that a direction decided in text names typefaces outside the overused list and ties palette, ground and signature moment to its subject.
- `benchmarks/font-defaults-probe.mjs` measures which typefaces models pick for unrelated briefs, unprompted and again with the overused list forbidden.
- The repository has issue forms for bugs and feature requests, a pull request checklist, a security policy that points to private vulnerability reporting, and the Contributor Covenant code of conduct.
- `npm run eval-reasons` stores a reasoned judge vote beside every failed llm grader vote of an eval run, in `judge-reasons.json`, and prints each grader's pass rate per arm.
- `npm run eval:savings-report` runs the `savings-report-reads-cold` eval on the no-plugin arm with Sonnet as judge and every run in flight, and `npm run eval:savings-report:draft` runs three of them for iterating on the report's wording.
- `/exo:savings guard-lines <lines>` sets the line count above which the read guard refuses a whole-file read, and the cost report names the current limit.

### Changed

- The benchmark runs twelve new template tasks on the same fixture, with new wording for the safe tasks, the no-run instruction, the one-liner prompt and the terse-prose control prompt; each published result names the task set it measured.
- The right-sizing ladder has four rungs, Need, Reuse, Borrow and Write, with the same precedence, tie-break and guards, in `using-exo`, the four code-writing delegate prompts and the README.
- `designing` states its turn limits, motion thesis, materials, timing, reduced-motion rule, browser finish list, build bindings and slop tropes in new wording and structure, with the same rules and values.
- The overused-font list is rebuilt from a criterion recorded in `overused-fonts.mjs`: Google Fonts' most popular families, platform and browser defaults, the `create-next-app` faces, and the faces models pick unprompted or fall back on, now 66 families; the craft recipes and check tests spell their CSS samples anew.
- `skills-tool` and its form, pressure, plugging and shape references are rewritten in exo's own words and structure, with the same loop, rules and bounds.
- `deepen` restates its scope, terms and audit with new card fields (Files, Friction, Refactor, Payoff, Confidence), and `debug`, `implementing`, `implementing-batch` and `merge-prs` reword single passages, with the same triggers and bounds.
- `/exo:savings` prints a boxed cost report: exo's cost as the headline, the reads the read guard refused with their file text, a line saying flatly that what exo saved is not measured because refused text has no token count or price, a cost table split into skill loads, re-reads and hooks with no token column, a guard table that sets each guard's refusals beside what its re-reads cost, a plain-words list of what is and is not measured, what to switch to spend less, and exo's token total once in the footer, away from any cost. The internal bookkeeping word is gone from every user-facing text. The first report after the update reads every stored transcript again; a session whose transcript is gone keeps what the guard held back and loses its cost figures.
- The status line segment reads `exo cost $0.04 · 2m · 2 reads refused`: cost first, refusals as a count, and no token or byte figure beside the cost.
- The README explains exo in its own words, adds a check that it works, folds its how-it-works sections into one list and the ladder, says how to weigh and tune the read guard, and drops the credits; the note on adding a setting moves to `CONTRIBUTING.md`.

### Fixed

- The eval case check skips `evals/results/`, where `claude plugin eval` writes its reports, and git ignores that directory, so `npm run check` passes after an eval run.

### Removed

- `THIRD_PARTY_NOTICES.md` and `LICENSES/Apache-2.0.txt`: every file is now exo's own work under PolyForm Noncommercial 1.0.0.

## 0.4.0 - 2026-09-16

### Highlights

- **Settings now come in layers.** Local, project and global files override exo's defaults, and `shaping` can store a spec as a GitHub issue.
- **Every run asks where it commits.** Before the first edit you pick a branch, a worktree or the current branch, and nothing pushes until you answer the finish question.
- **Releases are explicit.** `ship-issue` is gone, and a change only reaches you through a release.

### Added

- `settings` shows and changes exo settings in four layers: `.claude/exo.local.json`, `.claude/exo.json`, the plugin's global options (asked when the plugin is enabled, changed in `/config`) and the default. The session hook injects the resolved values as one `exo settings:` context line.
- The `specs` setting: `shaping` stores a spec in `docs/specs/` (default), as a GitHub issue whose body opens with `<!-- exo:spec -->`, or both, and writes the file when git, a GitHub remote or `gh` is missing. `planning` accepts `#<n>` and plans a marked issue without shaping it again.
- `issuing` fills size, effort, type and relations from the repository's own labels, types and project fields, or from a default label set when the repository defines none.
- `implementing`, `implementing-batch` and `debug` ask where a run commits (branch, worktree or the current branch) before the first edit, and end on a short overview with a finish question: open a pull request, push, or keep local.
- `npm run release-notes` renders a GitHub Release body from a changelog section.

### Changed

- Every exo question is plain numbered lines, `(1) Label (Recommended): what it does`, answered with a digit and never through a question tool. A stage option no longer carries its command, model and effort; one line under the options names a model only when it differs from the session's.
- Nothing pushes automatically: commits stay local until the finish question's answer, and `implementing` no longer enters a release run on the default branch.
- `npm run bump` reads the release level off `## Unreleased`, and the `plugin version` check asks for a changelog entry on every change instead of a version raise.

### Fixed

- `implementing-batch` names the three workspace options in its own step, so a session that cannot read `workspace.md` still offers the worktree.

### Removed

- `ship-issue`: plan an issue with `/exo:planning #<n>`, build it with `/exo:implementing`, open the pull request from the finish question, and merge with `/exo:merge-prs`.

## 0.3.26 - 2026-09-16

### Added

- Third-party notice files cover the material reused from other projects, and `LICENSE` opens with the licensor's required notice.

### Changed

- The README is a short guide in the shape of the larger plugin repositories: install, why, the skills by group, how it works, savings, develop, credits and license. The developer detail moved to `CONTRIBUTING.md` and `benchmarks/README.md`.

## 0.3.25 - 2026-09-16

### Fixed

- `implementing` builds a `Design:` task whose `## Visual direction` records no direction in the session under `designing`, as the model table already said, instead of ending the turn.

## 0.3.24 - 2026-09-16

### Changed

- `planning` hands over on the numbered lines `using-exo` fixes, which carry both run commands and stopping, and reads off the plan which command the recommended line carries.

## 0.3.23 - 2026-09-16

### Changed

- The next-stage question in `using-exo` is numbered lines the user answers by typing the digit, in a fixed order per stage, and running the next stage in this session is the recommended option; the recommendation moves to stopping only when a compaction has happened or a second stage has finished in the session. `designing` offers its browser preview the same way, with its price unchanged.
- `implementing` sends a task with a `Design:` line to a delegate on `opus` when `## Visual direction` names the chosen direction, and keeps a pending or missing direction in the session; the model table recommends `sonnet` for a plan whose directions are frozen.
- A plan's `## Plan basis` may no longer carry branching, commit, push or pull-request policy, and every acceptance check of a brief must reach a step's `Expected:`, a `## Final verification` line, or `## Non-goals`.

## 0.3.21 - 2026-09-15

### Changed

- `designing` routes each request through a `## Route` ladder: a settled identity or a tool surface gets one direction in text, and the browser preview offer stays for an open identity on an expression surface or a user who asks to choose. A component library alone no longer counts as a settled identity. The picker's answer starts Build in the same turn, only the recommended contract is filled before the offer, a direction fault is reported instead of re-running the cycle, and a read-only planning mode records `Direction: pending at rung <n>` instead of writing under the run directory.
- The closing rule in `using-exo` lets a message another rule sends alone, such as `designing`'s preview offer or a blocking question, end its turn with nothing from the ending beside it; a question whose options are the readings of the request names no rival. The next-action line is one action the user takes, never a question back or a slot left to fill, and the rival-reading line names the reading only, never a price, a route or an invitation to ask for it.

### Added

- `benchmarks/design-run.mjs` reports one designing run's wall-clock, tokens and checkpoint times inside the window its run directory spans, and `benchmarks/results/designing-routing-before.json` and `designing-routing-after.json` record one measured run on each side of the change. The `designing-settled-identity-no-offer` and `designing-dashboard-no-offer` evals cover the new routes.

## 0.3.20 - 2026-09-14

### Changed

- The closing rule in `using-exo` names the reading a decision rules out when the request itself read two ways; a choice of how to build still names no rival. The `using-exo-names-the-rival-reading` eval covers it.

## 0.3.19 - 2026-09-14

### Fixed

- The `implementing-runs-the-list` grader quotes its criteria, so `claude plugin eval` loads the case again instead of failing on `: ` inside an unquoted value.
- `tests/evals.test.mjs` parses every eval frontmatter with the `yaml` package, so a block the runner cannot load fails `npm run check`; CI runs `npm ci` first.

## 0.3.18 - 2026-09-14

### Changed

- The eval case for absent release instructions becomes `implementing-release-run-ci-releases`: a trunk-based repository whose CI releases `main`, which a run without the skill reads as a release run.

## 0.3.17 - 2026-09-14

### Fixed

- `implementing` takes the release-run exception only when the root instructions say work is committed on the default branch and the session releases there; "we ship from main" now gets a branch.

### Added

- Three eval cases for the release-run exception: ambiguous instructions, absent instructions, and explicit release instructions.

## 0.3.16 - 2026-09-14

### Fixed

- The `implementing` authorization line no longer grants a merge or a push before the tail answer.

### Added

- A test that guards the `implementing` push gate and its release-run exception.

## 0.3.15 - 2026-09-14

### Changed

- `implementing` pushes nothing until its tail question is answered, and hands a merge to `/exo:merge-prs` instead of running its steps.
- Every delegate dispatch names its model at the call site, and the `code-review` calls name the session's model.
- The four code-writing delegate prompts carry the full `using-exo` ladder, including the tie-break and the corner-cut comment.
- `builder-prompt.md` and `bug-fixer-prompt.md` forbid every `gh` command.
- The README states that a skill's `effort: high` reaches its delegates only when the skill starts from its slash command.

### Added

- Tests that every dispatch names a model and that the ladder copies match `using-exo`.

## 0.3.14 - 2026-09-13

### Changed

- `planning` takes the next session's model and effort from the `using-exo` next-stage table instead of repeating the rule.

## 0.3.13 - 2026-09-13

### Changed

- `implementing` commits each task once its checks pass and reviews the whole
  branch once, on opus, through `branch-reviewer-prompt.md`, before the release
  or pull-request step; the per-task reviewer prompts are gone.
- The implementer delegate builds a task whose every changing step carries its
  code straight from its brief, without loading `implementing-batch`.
- `shaping`, `planning`, `deepen` and `debug` end on one next-stage question
  that names the command, model and effort, and start nothing before the user
  picks.
- Every model-invocable description opens with "Use when", every skill that
  takes slash input carries an argument hint, and the README lists each skill's
  invocation settings.

### Fixed

- `implementing` stays on the default branch and pushes only at the release
  step when the repository's instructions commit and release there.

## 0.3.12 - 2026-09-13

### Changed

- The designing post-build review runs on opus again, still one round, because
  judging a design is design work and stays on the most capable model.

## 0.3.11 - 2026-09-13

### Changed

- The designing preview offer is one question with two options, the browser
  preview with its price of about 3,500 tokens per direction, or deciding in
  text, and a planning turn makes the same offer.
- `pick.mjs` opens the tab only once every comp exists and reports how long it
  waited; comps run live and whole in tight cards fitted to the window, and an
  enlarged comp fills the viewport with nothing around it.
- Every comp is written in one message with the picker start, the surface
  builders go out in the turn the foundation report returns, and the
  post-build review is one sonnet round, with the final pair captured by the
  session.

## 0.3.10 - 2026-09-13

### Fixed

- Skills no longer point to rules outside the repository; `designing` and the task reviewer state what they need themselves.

## 0.3.9 - 2026-09-12

### Fixed

- `capture.mjs` waits for the screenshot browser to exit before it removes the
  browser profile, and retries that removal, so a capture no longer fails with
  `ENOTEMPTY` on CI.
- A savings record that cannot be read or parsed is left untouched: the hook
  reports the error instead of rewriting the record with the current session
  alone.
- The record lock waits up to 8 seconds and counts a lock as stale only after
  15 seconds, past the hook timeout, so a slow hook keeps its lock.
- The session hook also runs on `resume`, so the plugin-root pointer follows a
  bump, and without `jq` it exits 0 with a notice on stderr.
- The verifier fails a skill description over 400 characters, the limit
  `skills-tool` sets, and runs the frontmatter, portable-language and
  description checks over every skill, not only the listed ones.
- `using-exo` no longer skips a skill whose description claims a read-only
  question, a two-file failure or a visual change, tells `deepen` from
  `shaping`, and names the user-invoked issue and pull-request commands.
- Delegate prompts agree with the skills they load: the implementer and the bug
  fixer skip the steps their callers own, the plan author rewrites a task's
  `Commit:` paths, and the designing builder and critic always receive the
  skill directory and write no git state.
- README, manifests and `CLAUDE.md` describe the plugin as it ships: six ladder
  rungs, four hook groups, the two-file batch floor and the release route.

### Changed

- `designing` reads its Phase 2, 3 and 4 mechanics from
  `references/phase-direction.md`, `references/phase-build.md` and
  `references/phase-critique.md` at the phase that needs them.
- The `shaping`, `designing`, `planning`, `debug` and `implementing-batch`
  descriptions are cut to 400 characters or fewer.
- `npm run check` runs the tests once, inside the verifier.
- `prices.mjs` also prices Fable 5, Opus 4.7, 4.6 and 4.5, and Sonnet 4.5.
- `bump.mjs` turns the `## Unreleased` heading into the new version's heading.

### Removed

- The record no longer writes a session's cost, duration, token or line totals,
  nor the guard's capped and duplicate counters: nothing read them.
- `researcher-prompt.md` drops its GitHub shortlist mode, which no skill
  dispatched.
- `verify.mjs --skip-link-check`, which no check read.

## 0.3.8 - 2026-09-12

### Added

- `using-exo` carries the closing rule every turn ends under: the outcome, the
  check that proves it, one next action, and nothing else. `debug`, `deepen`,
  `designing`, `implementing`, `implementing-batch`, `planning`, `research` and
  `shaping` name that rule instead of restating a report shape of their own.
- One eval case, `using-exo-closing-line`, which fails an ending that adds a
  rationale paragraph, an inventory of untouched work, or a closing menu.
- `designing` carries `references/feedback-and-status.md`, the seventeenth
  reference: waiting by duration band, skeleton discipline, the three conditions
  a provisional result must meet, transient-message dwell and placement, and its
  own Phase 5 sweep.
- `designing` opens with a `## Symptoms` table routing a reported fault to the
  reference that owns it, so a complaint is read about once instead of argued
  about twice.
- One eval case, `shaping-clear-goal-needs-no-brief`, which fails a run that
  writes a brief for a goal that was already decided.

- Two eval cases: `implementing-batch-two-file-floor`, the regression test for
  ceremony around a two-file change, and `designing-offers-the-preview`, which
  fails a run that renders before the chooser agrees or that names no cost.

- `implementing` scopes a reviewer's second round to its own findings and the
  fix diff through `re-review-prompt.md`.
- `savings` prices a session's tokens at API list prices per model
  (`prices.mjs`) when the status line reports no cost.

### Changed

- The savings panel and the status line segment report measured figures only:
  the read guard's refusals with the bytes they kept out of context, and the
  calls, tokens, price and wall time of the API calls that were exo's own work.
  The four estimated rows are gone with `skills/savings/scripts/ratios.mjs`,
  the ratio override in `config.json`, and the calibrated character, byte and
  millisecond rates that sized exo's text in context; `benchmarks/score.mjs
  --publish` now records its measured cut in `benchmarks/results/<date>.md`
  alone. `OVERHEAD_VERSION` rises to 3, so every record row is re-read from its
  transcript on the next turn.
- The codebase discovery scout runs on `sonnet` instead of inheriting the
  session's model: locating files and symbols is mechanical.
- `planning` hands a plan over with the one command that runs it, read off the
  task count, instead of asking which of two commands the user wants.
- `pick.mjs` takes the screen's copy from `--labels` alone, in the language the
  conversation runs in, plus a `lang` tag beside the words; `--lang` and the
  built-in en/nl table are gone, because a flag cannot know what language a
  session runs in. One English string per key is the last resort for a missing
  key.
- `pick.mjs` seats the grid from the contracts file and opens before any comp
  exists, filling each seat as its own `index.html` lands. A comp is now a
  fragment carrying its own markup and CSS; the picker injects the document
  shell, which is structural only, and the comp budget drops from 200 lines to
  180. `--intrinsic` alone still needs every comp on disk first.
- `shaping` counts the product decisions a request leaves open instead of the
  files it changes, and hands a decided goal to `planning` or
  `implementing-batch` without writing a brief. A brief it does write still
  lands in `docs/specs/<topic>.md`, because a brief living only in a message
  dies at the next context clear.
- `designing`, `shaping`, `planning`, `debug` and `deepen` descriptions carry
  the same triggers and "not for" cases in fewer characters: the always-loaded
  total falls from 4171 to 3953, inside the 4000 budget.
- `accessibility.md` names WCAG 2.2 focus-not-obscured (2.4.11) and the
  single-pointer alternative to dragging (2.5.7); `controls.md` makes accept and
  decline equal weight where the pair is consent; `composition.md` picks a
  disclosure container from the task's shape and places a touch-first primary
  action in the thumb band; `implementation.md` pads screen-anchored edges with
  `env(safe-area-inset-*)` and sets a mobile input at 16px; `motion.md` ships an
  in-product motion setting over the media query alone; `component-system.md`
  writes the table sort cycle into `aria-sort` and makes a paged table sort at
  the source; `interaction-qa.md` renders active filters as removable chips with
  live counts.

- The size gate `shaping`, `debug` and `implementing-batch` share sends a change
  reaching at most two files straight to the edit and its proof, and counts a
  crossed persisted format or security boundary where it counted user-visible
  behavior. `using-exo` routes the same change past every skill.
- `implementing` reviews each task in one delegate, against the task and against
  the code standard in one reading of the diff (`task-reviewer-prompt.md`),
  where it dispatched a spec reviewer and then a quality reviewer.
- `code-review` is skipped below three changed files and 80 changed lines and
  runs at `low` effort up to five files or 200 lines, `medium` above, in
  `implementing-batch`, `implementing` and `debug`.
- `planning` no longer pre-runs a deliverable plan's code in a scratch copy: the
  plan's own `Run:` and `Expected:` prove each task under its executor, and
  `## Plan basis` names what the planning session could not run. A deliverable
  plan now ends with the two ways to run it, `implementing` recommended, each in
  one plain sentence, and with the advice to clear the context first.
- `designing` offers the direction picker once, in its own message, and renders
  nothing before the answer; that offer states what the render costs, because an
  offer without its price is not one; this session writes the comps itself. A surface
  whose direction was decided before the run builds in the session and takes one
  critique round.
- `pick.mjs` defaults `--lang` to English.
- The right-sizing ladder rides in every session as part of the `using-exo`
  body the session hook injects, whatever the savings switch says; that switch
  now reaches the counter, the status line segment and the read guard alone.
  `implementer-prompt.md`, `bug-fixer-prompt.md` and `builder-prompt.md` carry
  the ladder in their own text, because a delegate never sees the session hook.

- `planning` writes plans in the task shape: `### Task n`, `Files:`, numbered
  steps carrying complete code with `Run:` and `Expected:`, and a `Commit:`
  block with a `Plan-task:` trailer. `Freedom:` levels, `Touches:` anchors,
  `replace:`/`with:` edits, `On drift:` lines and `[NEEDS CLARIFICATION]`
  markers are gone; a question is asked before the plan is written.
  `implementing` detects a landed task by its `Plan-task:` commit.
- The three briefs `implementing` hands its delegates sit beside `SKILL.md` as
  `<role>-prompt.md`; the verifier now checks `implementing` and every prompt file.
- `planning` reads `data-migration.md` from `implementing-batch` instead of
  carrying a copy, and its heading matches its name.

### Fixed

- The panel's lines row no longer subtracts the lines exo's own process writes
  (briefs, plans, research notes, designing runs, the handoff file) from the
  code estimate, which drove every session that shaped or planned into a
  reported loss; those lines still stay out of the product count. A session
  with no recorded call prices at a known zero instead of leaving a whole
  scope's cost column at `-`.

### Removed

- `skills/designing/comp-prompt.md`: `references/direction-preview.md` already
  carries the comp contract, and the comps are written in the session.
- `skills/implementing/spec-reviewer-prompt.md` and
  `skills/implementing/quality-reviewer-prompt.md`, merged into
  `task-reviewer-prompt.md`.
- `implementing-batch`'s hand-over of one checkpoint from `implementing`: a plan
  runs task by task under `implementing` or whole in the session, never one
  checkpoint per invocation.

- The `right-sizing` skill. Its ladder and its "never on the ladder" guards
  moved verbatim into `using-exo`, so the ladder holds without a skill call and
  an explicit ask for the minimal or lean version is answered from the same
  text. Its three evals are renamed `using-exo-*`.
- The savings panel's 30-day trend, the `exo:right-sizing` attribution in the
  record, and the right-sizing column in `benchmarks/score.mjs`.
- `validate-plan.mjs` and its test: the new plan grammar has no machine
  validator; the planning session reads the plan once against the spec's rules.
- The per-file line and character ceilings and the `line budgets` check: a
  skill's length is judged by `skills-tool`, not failed by the verifier.

## 0.1.0 - 2026-09-10

First public release, split out of a private dotfiles repository.

### Added

- Eleven skills that route the work: `shaping`, `planning`, `implementing`,
  `implementing-batch`, `debug`, `deepen`, `research`, `designing`, `issuing`,
  `ship-issue` and `merge-prs`.
- `skills-tool` for writing and judging a skill or agent, and `using-exo`, which
  a SessionStart hook injects so a session knows when to reach for the rest.
- Thirteen agents the skills dispatch, each pinned to the cheapest model and the
  narrowest tool list its job allows.
- `verify.mjs` with its self-test and the test suite under `tests/`, the gate
  every skill edit passes before a commit.
- PolyForm Noncommercial 1.0.0: use and change it freely, sell it never.
