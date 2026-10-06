# Changelog

Versions follow [Semantic Versioning](https://semver.org/spec/v2.0.0.html). A
skill's trigger, a skill or agent name, and the `exo:` namespace are the public
surface: renaming or removing one is a breaking change, adding one is a minor
release, and a body rewrite that keeps the trigger is a patch.

## Unreleased

### Added

- `pressure.mjs --setup <script>` rebuilds a case's fixture right before every run and runs the runs one after another, alternating arms, so no two runs share a fixture; `drive.mjs` clears its run directory before it copies the fixture in.

### Changed

- Agent descriptions shrink to the routing text a dispatch needs, cutting the agent listing every session pays from 2,769 to 956 characters, and a new lock in `verify/budgets.mjs` holds the total there.
- The session-start text drops the stage-order section and the references table: each stage rule moves into the skill it governs and the reference pointers shrink to two lines, cutting the text every session pays by 463 characters.
- Skill descriptions cap at 250 characters, cutting the skill listing every session pays from 3,319 to 2,725 characters; `DESCRIPTION_TOTAL_LOCK` and `DESCRIPTION_CHARS` drop to match.

### Fixed

- `benchmarks/pressure/verify/setup.sh` works again: its self-check now matches `verify.mjs`'s `FAIL Task 2 (exit 1)` line, and says which check failed instead of exiting 1 with no message.

## 0.92.0 - 2026-10-06

### Added

- `install.sh` updates and uninstalls exo too: `curl -fsSL https://raw.githubusercontent.com/blauwtje/exo/main/install.sh | bash -s -- --update` or `-- --remove`. `--remove` deletes `~/.exo` once no harness records an install and the clone has no local changes, and says why when it keeps the clone.

### Changed

- The README's Install section has one expandable block per harness, Claude Code and Codex, followed by update and uninstall commands. No install, update or uninstall step asks the user to type `git` or `node`, in the README or in `docs/codex.md`.

## 0.91.0 - 2026-10-06

### Highlights

- **exo installs with one command: `curl -fsSL https://raw.githubusercontent.com/blauwtje/exo/main/install.sh | bash`.** The README is now short enough to read in a minute.

### Added

- `install.sh` clones exo to `~/.exo`, or pulls that clone, checks for git and Node 22 or newer, then runs the interactive `install.mjs`, reading its prompts from the terminal under `curl | bash`. Arguments pass through, and a folder at `~/.exo` that is not a git clone is refused.
- `docs/codex.md` and `docs/settings.md` hold the Codex details, the settings and the guards that left the README.

### Changed

- The README drops from 182 to 74 lines: one install block, a table of other install routes, one skills table and one before-and-after table, with nothing told twice.
- The skill pages under `docs/skills/` and `ABOUT.md` use plain, shorter wording in one layout, and drop four claims the skills did not back.

## 0.90.1 - 2026-10-06

### Changed

- The Claude Code and Codex adapters share one `PATH` lookup in `harnesses/on-path.mjs`.

### Fixed

- `install.mjs` and `verify/model-kinds.mjs` now run when the path that starts them passes through a symlink, such as a symlinked home folder or a clone under `/tmp` on macOS. Before, they exited 0 with no output and no writes.
- `harnesses/codex/rules.mjs` rewrites the Claude-only terms left in generated Codex skills and agents into Codex wording. These are `` !`cmd` `` load-time commands, background runs, follow-up messages, the `general-purpose` agent type, `TaskStop`, `maxTurns` and Bash timeouts. Generation now fails when an agent still holds `{{SKILL_DIR}}`.
- `find-cause`, `spec` and `build`'s run loop drop their rule for the `exo: context` notice, which no hook has emitted since the context warning was removed.
- `tests/readme-install.test.mjs` turns off git's automatic maintenance in its fixture repository. The maintenance run packed and deleted loose objects while the README clone line copied them, and the test failed in about 5 runs out of 8.

## 0.90.0 - 2026-10-06

### Added

- `node ~/.exo/install.mjs` is one installer for every detected harness (Claude Code, Codex) at user, shared-project or private-project scope, with `--update` and a remove path; each harness sits behind an adapter registered in `harnesses/registry.mjs`.
- `harnesses/claude/adapter.mjs` installs exo into Claude Code through its `claude plugin` CLI and records each install in `${CLAUDE_CONFIG_DIR:-~/.claude}/exo/installed.json`.
- `npm run generate` builds the Codex skill and agent tree under `harnesses/codex/generated/` from the Claude sources by rule (`harnesses/codex/rules.mjs`), with hash-pinned overrides in `harnesses/codex/overrides/`; `npm run check` fails on a stale tree, a stray file or a changed override.
- `harnesses/codex/run.mjs` runs skill scripts as Codex and refuses any path outside the plugin root's `skills/*/scripts/`.

### Changed

- `codex/` moved to `harnesses/codex/` with no shim, and `codex/install.mjs` became the Codex adapter behind the shared installer.
- The host comes only from `EXO_HOST`; `CLAUDECODE` and `CODEX_HOME` no longer change it.
- Codex installs copy the generated tree instead of linking the Claude `skills/`, and the install record holds several installs, reading the old single-target record as one `user` install.
- README gives one install command per harness.

### Removed

- `npm run codex-agents` and `harnesses/codex/write-agents.mjs`, folded into `npm run generate`.

## 0.89.0 - 2026-10-06

### Added

- `node codex/install.mjs` installs exo into Codex. It links the skills into `~/.agents/skills`, copies agent files generated from the model kind table into `~/.codex/agents`, and merges exo's hooks into `~/.codex/hooks.json`; `--remove` takes out exactly what it wrote. `npm run check` fails when the generated agent files drift from the table.

## 0.88.2 - 2026-10-05

### Fixed

- `CONTRIBUTING.md` states `exo:build-ui`'s current 60-turn and 60-call limits instead of the old 35.

## 0.88.1 - 2026-10-05

### Fixed

- `exo:build-task` gets a 60k soft budget, and a smaller task's dispatch drops to no less than 45k/75k, because the 25k to 40k it got stopped about one build-task in four before its first edit.

## 0.88.0 - 2026-10-05

### Added

- `land-task.mjs --check` runs only the Files: and report checks, commits nothing and prints `Report OK: Task <n>`; build-task runs it before returning GREEN, so a malformed report gets fixed inside the builder's own turn.

### Changed

- Every land-task report refusal ends with the full expected layout under Proof, filled with the task's command, so one round fixes every report fault.
- A land-task report refusal goes back to the agent that wrote the report with the refusal verbatim, never a session rerun of the proof, and a build-task budget stop redispatches build-task with a raised budget, never an improvised prompt to another agent.

### Fixed

- A `Files:` entry ending in `/` covers every changed path under that folder, so a task that regenerates snapshot files lands without listing each file.

## 0.87.1 - 2026-10-05

### Changed

- Release notes list each change with the pull request, branch or commit it came from, and drop the separate pull-request list, the upgrade commands and the restart line.

## 0.87.0 - 2026-10-05

### Changed

- build-task quotes a failing `Red:` run before the production edit and a passing `Proof:` run after, for every test-first task, and `land-task` lands a report holding the `Red:` line.
- Both branch reviewers report a test-first task whose report shows a passing run with no `Red:` failing run before it as a `defect`.

### Added

- Benchmarks gain `review-green-first-<effort>` review cells, a `prepareGreenFirstBranch` fixture and pressure cases for build-task and review-branch, so the red-before-green rules get measured.

## 0.86.2 - 2026-10-05

### Highlights

- **design-ui's one pass builds and repairs the page in an `exo:build-ui` page scope again, so the main session stays under its context limit.**

### Changed

- design-ui's one pass hands the page build and its one repair to a single Opus `exo:build-ui` page scope that reads `build-pass.md` first and returns a short report, because the main session's own page writes added about 68k tokens and pushed a benchmark run to 157k context.

### Fixed

- design-ui sends the color and font line that `picks.mjs` now prints, "also used in" warning included, before the first edit, so a repeated pick no longer surfaces only in the final reply.
- design-ui's font and accent clauses name this user and this product, and a font or accent swapped after the plan gets a new clause and a rewritten plan line.
- check-ui prints its summary in at most 2 lines and writes the per-type lines to its report file.

## 0.86.1 - 2026-10-05

### Fixed

- proof-check judges the reply that ends the turn, not the one before it, and reads a Proof command written as a backtick span followed by a label, so a corrected report no longer stays blocked.

## 0.86.0 - 2026-10-05

### Added

- design-ui logs each project's display font, body font and accent in one machine-wide file and warns on the color and font line, in the reply's language, when another project already used a pick; it never blocks or asks.
- design-ui saves the display font, body font and accent in `docs/design/DESIGN.md` beside the reference product and reuses them on the next run.
- `benchmarks/design-run.mjs` reports a design-ui run's final context size, and `benchmarks/design-ui-tests.md` records the three fixed test prompts and their checklist.
- check-ui reports `region-stops-short`, a sidebar or background that stops before the bottom of the page.

### Changed

- design-ui reads at most four screenshots per run, the post-build and final pairs, plus one per fault under repair, and checks other states in the source.
- design-ui loads only the reference sections a row names, through Read with an offset and limit instead of `cat` or `awk`, and never rereads a persisted tool output, so a long output no longer enters context twice.
- design-ui keeps its slop-trope list in `build-pass.md` only; `visual-critique.md`, the critique agents and the verify pin point there.
- design-ui's scope form no longer asks which product the page should feel like; without a product the user names, it picks the look from the user and the subject and shows the color and font line before building.
- design-ui words every form question and option in plain words in the user's language, under the tabs "For whom", "What's in" and "Designs".
- The design-ui test prompts and pressure fixtures are written in English.

- design-ui builds the one pass in the main session after reading `build-pass.md` whole; `exo:build-ui` no longer takes a page scope.
- design-ui's plan gives each font and the accent one clause on why it fits this product and this user, and caps each ASCII layout at 8 lines per width.
- design-ui keeps the fixed app minimum (navigation, search, user menu, counters, chart, table, detail panel) to admin, dashboard and tool screens; a lesson, checkout, game or consumer screen takes its content from the user's tasks and stays focused.
- design-ui lists a cobalt or other saturated mid-blue accent as a slop default, kept only when the prompt or product asks for blue.

### Fixed

- design-ui's picks log counts an accent close in OKLCH to another project's as a repeat, so a second cobalt warns even when its hex differs.
- design-ui sets amounts in the page's body or display family with `tabular-nums`, never a monospace family.
- design-ui numbers each pass's report and captures, so no pass overwrites the one before it.
- design-ui's finish step reruns only the capture, and an empty `reference.mjs --set` value names the `--set` flag in its error.

## 0.85.2 - 2026-10-05

### Fixed

- The writing guard lets commit, pull request, issue and release text name the product as its subject, and still refuses it behind a verb of authorship such as "made with", as its claude.com link or in a branch name.
- The refactor docs page no longer routes finding what to refactor to the removed `audit-architecture` skill.

## 0.85.1 - 2026-10-05

### Fixed

- `npm run check` fails when a pinned design-ui doc list still names a tell or label its JSON asset dropped, and a self-test case mutates the asset side.

## 0.85.0 - 2026-10-05

### Added

- The benchmark runner has a `git-false-done` task, scored from the suite result and the final claim, and `benchmarks/demo/setup.mjs` seeds a repository for the force-push demo.

### Changed

- The manifests, `package.json` and the README social preview describe exo as a Claude Code plugin with four stages and hooks that refuse risky commands.

### Fixed

- The proof check names a Done claim in its block reason only when the report makes one.

## 0.84.1 - 2026-10-05

### Changed

- `remember` names the book command once per session start, including after clear and compaction, instead of on every prompt, and no longer logs prompts to `nudge-log.jsonl`; the `stats` subcommand is removed.

## 0.84.0 - 2026-10-05

### Added

- The benchmark runner has a `git` tier with a force-push hazard seed, scored from the remote's git state, plus `skills-rival`, `cc-safety-net` and `prose-rules` arms, pinned rival fetching through `benchmarks/rivals.mjs`, and `--effort` and `--dry-run` flags.

## 0.83.9 - 2026-10-05

### Changed

- The `remember` correction nudge works in any language: every main-thread prompt gets one shorter book sentence and the session decides whether it corrects a repository fact, instead of matching a list of English and Dutch words; prompts with no letter or digit and bare slash commands are skipped.
- The design-ui tests use German instead of Dutch as their non-English input.
- The benchmark reports in `docs/benchmarks/` are translated from Dutch to English.

## 0.83.8 - 2026-10-05

### Changed

- The README tagline now reads "Claude Code plugin with four stages and hooks that refuse risky commands.", the one-liner from the positioning research.

## 0.83.7 - 2026-10-05

### Fixed

- build's builder asks `node lib/mcp-tool-call.mjs "<proof>"` whether each Proof is an MCP call (`DEFER`, with or without `mcp:`) or a shell command (`SHELL`), and reports a `DEFER` Proof as deferred without running it, so the agent names no tool list.

## 0.83.6 - 2026-10-05

### Changed

- The README opens with a tagline, a jump-link row and a before-and-after table of real guard output, and folds the command, stage, guard, settings and contributor details into collapsible sections.

## 0.83.5 - 2026-10-05

### Fixed

- build's land-task and proof-check treat a Proof that starts with a known MCP tool name but lacks the `mcp:` prefix as an MCP Proof: land-task never runs it and expects it deferred, and proof-check matches it only against the session's MCP tool call; verify, land-task and proof-check now share one list of known MCP tools.

## 0.83.4 - 2026-10-05

### Fixed

- verify hands a task Proof that starts with a known MCP tool name but lacks the `mcp:` prefix to the session as a `SESSION Task <n>` line, as it already did for the Success criterion, and counts it with its `mcp:` form when it repeats.

### Changed

- verify's fallback list of known MCP tools adds roblox-kit's `build_map`, `check_map` and `capture_zones` and Studio's `start_stop_play`, `get_console_output`, `character_navigation`, `user_keyboard_input`, `script_read` and `multi_edit`; `mcp:<tool> <args>` stays the rule.

## 0.83.3 - 2026-10-05

### Changed

- The README is rewritten for a quick scan: install first, then one table of what each skill does, example prompts and a compact settings table, with internals left to `CONTRIBUTING.md`.

## 0.83.2 - 2026-10-05

### Fixed

- spec writes a Success criterion that calls an MCP tool as `mcp:<tool> <args>`, the same form as an MCP Proof.
- verify hands a Success criterion written `mcp:<tool> <args>`, or starting with `run_playtest`, `search_game_tree`, `user_mouse_input`, `execute_luau` or `screen_capture`, to the session as a `SESSION success-criterion` line instead of running it through the shell (exit 127).

## 0.83.1 - 2026-10-04

### Fixed

- build's Stop hook never lets a report end as Done with an unbacked proof: after a block, each proof still without a matching call must appear as an `Unverified: <command> (<reason>)` line with no Done claim; after five blocks the turn ends with a visible `exo proof-check: report not verified` warning naming those proofs.

## 0.83.0 - 2026-10-04

### Highlights

- **A plan Proof that needs an MCP tool is written `Proof: mcp:<tool> <args>`, and the session runs it as a tool call; builders and the verify gate never shell it.**
- **build's Stop hook now checks every `Proof:` line against a Bash or MCP call this turn, including on its retry, so a report must quote each proof's real output.**

### Added

- A plan `Proof: mcp:<tool> <args>` names an MCP tool: verify prints a `SESSION` line for it and the session runs it, builders report it `deferred` and land-task lists it `Pending:` for the session to run after the unit, and with no matching tool the report says `Unverified:`.
- spec loads every installed non-exo skill whose description matches the request before its first question, and recommends that skill's pattern over an option it rules out.

### Fixed

- build's Stop hook no longer passes any report once it has blocked one: it checks every `Proof:` line (bulleted, `->` or `→`) against a Bash or MCP tool call this turn, and stops blocking after two blocks per build turn.
- verify reports an unmarked Proof whose first word looks like an MCP tool and exits 127 as one to write `mcp:<tool>`, not a bare `command not found`.
- spec's handoff recommends building unless the brief's `## Open points` lists an entry, instead of always recommending Adjust the brief.

## 0.82.1 - 2026-10-04

### Changed

- design-ui saves the product a project should feel like in that project's `docs/design/DESIGN.md` instead of per user, asks only when none is saved and the prompt names no product or style, and lets a prompt that names one override and update the saved choice.

## 0.82.0 - 2026-10-04

### Added

- design-ui's form asks which product the result should feel like (Linear/Vercel, Stripe, Notion, Duolingo or your own), remembers the answer per user and offers it first next time; the product sets finish, density and motion, never brand, logo or layout.
- `check-ui.mjs` reports `hard-offset-shadow`, a solid unblurred offset shadow on a button or card, and the slop lists ban it unless you ask for neobrutalism.

### Changed

- design-ui's one pass builds in one fresh `build-ui` agent on Opus from the plan and chosen comp while the main session only coordinates, and every run ends on a 390 and 1440 capture taken after its last change.

## 0.81.3 - 2026-10-04

### Fixed

- design-ui's picker no longer shows a blank frame for a React or Vite comp: its sandboxed frame has no origin, so the module script was blocked; a served comp's assets now answer that origin and a dev-server comp keeps its own.

### Changed

- design-ui builds each direction comp in its own `build-ui` agent in parallel, renders stack comps from the project's dev server through `pick.mjs --url`, and makes the chosen comp the first screen Build keeps instead of rebuilding it.

## 0.81.2 - 2026-10-04

### Changed

- design-ui shows 2 or 3 directions as real first-screen comps in the picker, one at a time on a dark neutral ground, built with the project's stack, real fonts and the build-pass rules, instead of one side-by-side sketch; the directions now differ in layout, colour, typeface and shape at once.

## 0.81.1 - 2026-10-04

### Changed

- design-ui's overused-font list bans Archivo and its whole superfamily, since models picked it unasked in run after run.

## 0.81.0 - 2026-10-04

### Highlights

- **design-ui now asks who uses the screen and builds the plan around that user's top three tasks, with a Laws of UX rule behind each layout choice.**

### Added

- design-ui's intake form opens with a Users question, three or four proposed users with role, device, frequency and main task, recorded in `$RUN/user.md`.
- design-ui's intake form asks "Directions first?" with 1, 2 or 3; at 2 or 3 the directions appear as sketches in the sketch tab and the clicked one gets built.
- design-ui's friendly and playful mood may use generated illustrations of the product's own content when an image generator exists, never another product's characters or brand.

### Changed

- design-ui's plan names the user's three most important tasks, orders the screen by them, and tags each major layout choice with its Laws of UX rule.
- design-ui shortlists three faces and three accent hues, drops the first of each, and ties each kept face and hue to a fact about the user.
- design-ui themes every fetched shadcn component past the preset, radius, density, type, color tokens and `cva` variants, and the build pass and critic count a stock shadcn component as slop.

## 0.80.5 - 2026-10-04

### Highlights

- **design-ui now builds an empty folder on Vite, React, TypeScript, Tailwind, shadcn/ui and lucide-react instead of one hand-written HTML file.** An existing project, plain HTML included, keeps its own stack.

### Changed

- design-ui's new `stack` reference maps each job to a package in an empty folder: shadcn charts (Recharts), the shadcn data table (TanStack Table) with sorting, filtering and selection, sonner, cmdk, vaul, `@number-flow/react`, Motion and Fontsource, every component fetched with the shadcn CLI, no shadcn block as the base, and Magic UI only on landing pages.
- design-ui previews a default-stack build through Vite's dev server, started in the background and stopped before the report, instead of a `file://` url.
- design-ui's platform-first and no-new-dependency rules, Google Fonts option and hand-drawn chart allowance now hold only for an existing project, and the critic flags a hand-drawn chart, a hand-written shadcn component or a block used as the base.

## 0.80.4 - 2026-10-04

### Fixed

- design-ui's one pass reads a single build reference of under 12 KB in Phase 3, character rules first, instead of collecting sections from a dozen references.

## 0.80.3 - 2026-10-04

### Fixed

- design-ui's check-ui writes every finding to its on-disk JSON report, also without `--all`; the flag now only widens the summary, `--json` output and `--baseline` comparison.

## 0.80.2 - 2026-10-04

### Fixed

- design-ui names one standout element, tints its ground and surfaces and varies block shape in every mood, and lists white cards on grey with one blue or teal accent as a slop trope.
- design-ui's check-ui prints a short summary of definite and blocking findings grouped by type, writes the full JSON to disk, and leaves out `target-size-enhanced` and px in media queries unless `--all` asks.
- design-ui's one pass reads only the named sections of each reference, so a page run loads fewer reference bytes into context.

## 0.80.1 - 2026-10-04

### Fixed

- design-ui's capture drives Chrome through Playwright first and uses obscura only as a fallback, flagged with a warning on stderr and in each record, because obscura lacks popover, `<dialog>` and SVG `<use>` and lays pages out differently.

## 0.80.0 - 2026-10-03

### Highlights

**design-ui now aims for a polished, modern, cleanly finished look in the chosen mood, with no theme or props taken from the subject unless you ask.**

### Changed

- design-ui's goal is a polished, modern and cleanly finished result in the chosen mood; a theme, metaphor or prop drawn from the subject, such as a barcode or a ledger, appears only on request.
- design-ui allows monospace only for code, not for amounts, times or order numbers, and no longer sets labels in all caps by default.
- design-ui's overused-font list no longer includes Inter and Geist, and `direction.mjs --check` rejects a chosen font that stays on that list.

### Fixed

- design-ui centers the text of search fields and selects vertically and draws their arrows itself, with no browser-default select arrow or search cancel button.

### Removed

- design-ui's font candidate gate, `scripts/font-candidates.mjs`: the model picks a well-made modern font that fits the mood itself.

## 0.79.0 - 2026-10-03

### Highlights

**design-ui picks colors, fonts and layout itself from the mood and the product again, instead of from a random deal.**

### Changed

- design-ui always gives an app screen navigation with icons, search, a user menu, stat counters with sparklines, at least one chart, a table with avatars, badges, sorting and bulk selection, and a detail panel; the scope form adds groups on top but never drops these.

### Fixed

- design-ui's build floor makes the page background and any sidebar run the full page height, so a full-page capture no longer shows a band of another color below them.

### Removed

- design-ui's random look variety: the random seed, the dealt accent hue and its check, the exclusion of fonts from earlier runs, and `direction.mjs --deal` and `--check-plan` with their layout deal.

## 0.78.4 - 2026-10-03

### Changed

- design-ui's default one pass now deals its own look: `direction.mjs --deal` draws a random seed, an accent hue clear of recent runs and a layout structure (navigation, body and lead) that skips the last runs' choices, and `--check-plan` holds the plan's palette and layout to that deal before the build.

### Fixed

- `font-candidates.mjs --history` now also reads the fonts of earlier one-pass runs from their `plan.json`, and the Google route drops those faces instead of only ranking them lower.

## 0.78.3 - 2026-10-03

### Highlights

**design-ui now builds one complete page in this session by default; the picker, survey, builder split, critique and QA run only when you ask for them.**

### Changed

- design-ui builds a page in one pass by default: a short plan of colors, fonts and an ASCII layout, checked against the request, then the build, a capture at 390 and 1440 wide that the builder looks at, and one fix pass; `build-ui` surface scopes run the same capture and fix pass.
- design-ui's direction picker shows each comp as a complete, scrollable page in its own tab at full size, and refuses to open until `pick.mjs --check` has captured every comp at 390 and 1440 and those captures were viewed.

## 0.78.2 - 2026-10-03

### Highlights

- **design-ui turns a short ask into a full screen: it completes the scope a mature product carries, asks it as one form with a Mood question, and builds rich motion on every screen.**

### Changed

- design-ui completes a short ask with navigation, search and filtering, data visualisation, rich components and every state, and shows the scope groups and four moods (crisp and businesslike, friendly and playful, calm and luxurious, bold and expressive) as one form before Direction, on tool surfaces too; a named mood, "decide yourself" or a headless run skips the form and builds every group.
- design-ui derives palette, type, shape and motion feel from the chosen mood, and every screen meets one motion bar whatever the mood: staggered entrances, count-up figures, sliding indicators, view transitions, sliding-in panels and a reduced-motion mode.
- design-ui keeps an unnamed product generic instead of inventing a brand or domain, and states the scope and mood in one line each before Direction.

### Fixed

- design-ui no longer repeats a look across projects: `direction.mjs` and `font-candidates.mjs` draw a random seed, `--plan` deals an accent hue that `--check` holds the palette to, and `font-candidates.mjs --history /private/tmp/designing` keeps faces and their width variants from earlier runs out.
- design-ui's `capture.mjs`, `check-ui.mjs` and `inspect-styles.mjs` wait up to 4 s for entrance animations and count-ups to settle before a capture or measurement, so critique and QA no longer judge a faded page or a half-drawn chart.

## 0.78.1 - 2026-10-03

### Fixed

- build's Stop-hook proof check runs only on a turn that called build since the last message the user typed, so a later plain turn such as a `git pull` is no longer blocked; tool results, task notifications, the skill body and hook feedback do not end a build turn.
- The proof check matches a written path against each standalone token of the Proof command, or its absolute form, instead of any substring, and a `cp` or `mv` destination stops at the next shell separator, so `| head -1` no longer counts as session-written input.

## 0.78.0 - 2026-10-03

### Added

- `docs/benchmarks/skill-model-field.md` records that a `model:` line in a skill's frontmatter does not keep the main session on that model: a skill loaded through the Skill tool ignores it, and a typed one reverts at the first background notification.
- `docs/benchmarks/unit-route.md` compares the direct route, the unit route and a Sonnet main session on the lean-gates fixture, and records why the unit route did not land.

### Changed

- The solve-hard agents list their tools (`Read, Edit, Write, Glob, Grep, Bash, Skill`) instead of inheriting every tool, MCP tools included.

## 0.77.0 - 2026-10-03

### Added

- The lean-gates benchmark takes `--plan old|new`, opens with a warm-up suite run, and counts whole-suite runs per agent type; `docs/benchmarks/suite-guard.md` records why a guard against whole-suite runs in subagents did not land.

### Changed

- plan-check reports a task whose `Proof:` runs the whole test suite.
- `land-task --fix` takes `--plan` and runs the plan's `Lint:` command on the changed scripts, and verify passes it.

## 0.76.0 - 2026-10-02

### Added

- The process-structure check fails a SKILL.md body that repeats a `##` or `###` heading, or a non-blank line over 40 characters outside tables and fences.

### Changed

- The configure overview leads each setting with its label and plain value, with the raw key, raw value and origin in brackets after it.
- The configure safety menu folds `heavy_commands` and `heavy_after_seconds` into one Slow commands pick with its own question, the ship menu takes its fifth value as a typed answer, and the `heavy_commands` question offers to clear the list, so every settings question keeps the question shape.
- The unread `route-skills` next-stage reference is gone; its rules on an `exo: context` notice and on a borrowed stage returning control now sit in `spec` and `find-cause`.
- edit-skills runs its pressure scenarios on the model and effort cell picked for the skill's kind, not a fixed `sonnet:high`.
- The README, the start cheat sheet and the start doc now use the same verify phrases, remember wording and spec hand-off.

### Fixed

- land-task accepts a build report whose proof sits on one line as `Proof: <command>: pass`, while a `Proof:` line with no passing command still refuses.
- The build-task agent copies the brief's `Proof:` command character for character in its report, never shortening a path.
- next-task briefs carry the plan's `## Decisions` bullets for the task's paths.
- The plugin version check warns and asks for a rebase onto `origin/main`, instead of failing, when only a release moved `origin/main` ahead of the branch.
- save-session's no-note reference has a reader again: the row now fires when save-session itself starts without a note.

## 0.75.1 - 2026-10-02

### Fixed

- verify names why a Proof or the Success criterion failed on its `FAIL` line (the signal, the exit code or an unclean `SUMMARY` line) and prints the last 20 lines of its output under it, so a check that dies early can be diagnosed.
- verify judges a Success criterion whose output has no `SUMMARY` line on its exit code alone, so another project's `npm run check` that exits 0 no longer fails the gate every time.

## 0.75.0 - 2026-10-02

### Added

- A lean-gates benchmark (`benchmarks/lean-gates.mjs` with its fixture, metrics script and tests) runs `/exo:build` plus verify headless against two exo commits, and its first report, `docs/benchmarks/lean-gates-2026-10-02.md`, finds the lean gates 32% faster at equal quality but not cheaper.

### Fixed

- Benchmark pricing gives `claude-opus-5-5` its own list rates ($4 input, $20 output) instead of falling back to `claude-opus-5`, which overstated its transcript cost by about 40%.

## 0.74.3 - 2026-10-02

### Changed

- The scannable output style gives each Shape bullet one rule, with no change to the replies it shapes; the last 2 instruction-density allowlist entries are gone and the lock drops from 2 to 0.

### Fixed

- The run-unit agent now builds each task dispatch from build's implementer prompt, which build already said the unit reads, so the task's `Budget:` line and report path reach build-task.

## 0.74.2 - 2026-10-02

### Changed

- The agents run-unit, review-branch (with its review-branch-deep and review-branch-deep-high twins) and locate-code give each instruction bullet one rule, with no behaviour or dispatch contract change; their 7 instruction-density allowlist entries are gone and the lock drops from 9 to 2.

## 0.74.1 - 2026-10-02

### Changed

- The design-ui agents build-ui, survey-ui and critique-ui (with its critique-ui-high twin) give each instruction bullet one rule, and build-ui fences its copy of the reuse ladder in a `text` block like its sibling copies; their 13 instruction-density allowlist entries are gone and the lock drops from 22 to 9.

## 0.74.0 - 2026-10-02

### Added

- plan-check and the plan parser read a `Lint:` plan-basis line and a `Risk:` task field; spec defaults the land gate to a project-wide type check.
- The code standard forbids guards for a state the code's own boundary rules out and asks types to make invalid states unrepresentable.

- build lints each task's existing script `Files:` with the plan's `Lint:` command before landing, and records a caller-breaking exported signature change as a `Signature:` trailer in the task's commit.
- spec marks each risky task with a `Risk:` field and defaults `Lint:` to the project's linter binary.

### Changed

- verify picks the deep reviewer on risk (a `Risk:` task, a manifest or lockfile change, a `Signature:` trailer, or a script-file commit without `Plan-task:`), not on diff size.

### Fixed

- verify runs the Success criterion even when the plan says `Land gate: none`.

## 0.73.2 - 2026-10-02

### Changed

- write-docs, remember and configure give each instruction bullet one rule; write-docs drops the `## When to use` section that restated its description, and configure moves the setup walk's rules into its setup map and cuts that map's contents list; their 3 instruction-density allowlist entries are gone and the lock drops from 25 to 22.

## 0.73.1 - 2026-10-02

### Changed

- start gives each instruction bullet one rule in its SKILL.md, drops the `## When to use` section that restated its description, and cuts the cheat sheet's stance paragraph and `## Judgment` notes; its 2 instruction-density allowlist entries are gone and the lock drops from 27 to 25.

## 0.73.0 - 2026-10-02

### Added

- The `exo:fix-review` agent repairs branch review findings marked `fix`; review-branch and its deep variants return a `fix=<n>` count, and verify dispatches the fixer only at `fix=1` or more, so a review with only `report` findings skips the fixer, its gate rerun and its commit.
- plan-check flags a plan whose independent tasks carry no `Worktree setup:` line, since build then runs them one at a time.

### Changed

- verify.mjs skips a repeated Proof and a `node --test` Proof whose files the default gate's globs already run.
- build admits a parallel wave in plans of two or more tasks, down from four.
- build's lead reads `git diff --stat` on a GREEN return instead of the full diff.
- route-skills sends read-only codebase discovery to `exo:locate-code`, one question per dispatch.

## 0.72.11 - 2026-10-02

### Changed

- find-cause gives each instruction bullet one rule across its SKILL.md, both prompts and both references, splits the fixer prompt's Bash-boundary and test-first rules, lists one handoff field per bullet, and drops the investigator's no-delete sentence that `exo:solve-hard` already carries; its 3 instruction-density allowlist entries are gone and the lock drops from 30 to 27.

## 0.72.10 - 2026-10-02

### Changed

- save-session gives each instruction bullet one rule across its SKILL.md and reconstructing reference, fences the Resume paragraph byte-identical, and drops rules its description and script already cover; its 3 instruction-density allowlist entries are gone and the lock drops from 33 to 30.

## 0.72.9 - 2026-10-02

### Changed

- ship gives each instruction bullet one rule across its SKILL.md and references, moves the merge `--strategy`/`-X` guard into merge-conflicts.md, and has the watch route read pr-comments.md instead of restating its comment rules; its 4 instruction-density allowlist entries are gone and the lock drops from 37 to 33.

## 0.72.8 - 2026-10-02

### Changed

- verify gives each instruction one rule per line in its SKILL.md steps; its 4 instruction-density allowlist entries are gone and the lock drops from 41 to 37.

## 0.72.7 - 2026-10-02

### Changed

- route-skills gives each instruction bullet one rule across its injected SKILL.md and references, leads question.md with its most-broken rules, and drops the stance paragraphs its question and next-stage references restated; its 5 instruction-density allowlist entries are gone, the allowlist lock drops from 46 to 41 and the injected-context lock from 2540 to 2532 bytes.

## 0.72.6 - 2026-10-02

### Changed

- edit-skills gives each instruction bullet one rule across its SKILL.md and references, leads instruction-style.md with its most-broken rules, and drops rules its references restated; its 7 instruction-density allowlist entries are gone and the lock drops from 53 to 46.

## 0.72.5 - 2026-10-02

### Changed

- file-issues gives each instruction bullet one rule across its SKILL.md and fields reference, and drops rules its fields reference restated; its 8 instruction-density allowlist entries are gone and the lock drops from 61 to 53.

## 0.72.4 - 2026-10-02

### Changed

- spec gives each instruction bullet one rule across its SKILL.md and references, and drops the brief sections the task-list specification owns; its 9 instruction-density allowlist entries are gone and the lock drops from 70 to 61.

## 0.72.3 - 2026-10-01

### Changed

- build gives each instruction bullet one rule across its SKILL.md, references and delegate prompts, and leads each reference with the rules most often broken; its 26 instruction-density allowlist entries are gone and the lock drops from 96 to 70.

## 0.72.2 - 2026-10-01

### Changed

- design-ui gives each instruction bullet one rule, leads every reference with the rules most often broken, cuts rules restated across its files, and loads phase-detail by section; its 92 instruction-density allowlist entries are gone and the lock drops from 189 to 96.

## 0.72.1 - 2026-10-01

### Changed

- ship switches the main checkout to the pulled default branch after a merge, and reports a dirty or diverged checkout instead of forcing it.

## 0.72.0 - 2026-10-01

### Added

- edit-skills' instruction style gives each bullet one rule and keeps the rules most often broken first, and a verify check fails a list item of three or more sentences or a sentence over 40 words, with a locked allowlist of today's offenders that can only shrink.

### Fixed

- git-guard allows force-deleting a branch whose content already landed on main as a squash commit.

## 0.71.1 - 2026-10-01

### Highlights

**exo asks one plain question at a time.** Each question has a short title, at most two plain sentences, usually three or four options lettered (A), (B), (C), and ends with the recommended option and why it beats the others; you answer with one letter.

### Changed

- Every exo question follows the new one-question shape: no numbered rounds, no `1a 3b` replies, no token counts, model names or commands in options, and the next-stage, ship, workspace and design-ui questions are reworded in plain words.
- configure asks by plain topic (how I work, where work goes, safety and speed), then the setting, then its value, with plain texts kept in `schema.json`.

## 0.71.0 - 2026-10-01

### Added

- The Bash guards judge each command inside a `bash -c`, `sh -c`, `zsh -c` or `eval` string like a top-level one, and deny when an inner command would be denied.
- The first session on a machine shows one line pointing at `/exo:start` and `/exo:configure`, then never again.

### Changed

- verify runs per-task proofs in parallel and skips the gate and proofs land-task already ran on the same tree.
- build's run-loop step 5 splits by route, and no-spec steps 6 and 7 name their action.
- The delegate budget gives `general-purpose` and `Plan` a soft limit of 70, and read-only agents get a soft notice without the advice to commit.
- edit-skills treats its line and step limits as aims, and a reference may link to no other reference.
- `npm test` runs two test files at a time, so a full run no longer overheats the machine.
- configure asks for the budget during the setup walk, ship reports fix commits as a count and a range, and design-ui's build-ui and critique-ui read only the sections they need.
- CONTRIBUTING describes the heavy-command wrapper, the SessionStart imports and the budget overrides.
- Scripts share one `isMain` entry check, build shares `waveLine` from plan-tasks, and sketch-tab imports page-chrome directly.

### Fixed

- git-guard and writing-guard recognise `git` behind tabs, line continuations, a quoted `"git"`, `git.exe`, a path or backtick, and `--git-dir`, `--work-tree` or `--namespace` with a separate value.
- git-guard refuses `git restore .` or `*` without `--staged`, `git checkout -f`, `git switch -f` or `--discard-changes`, and a push of `:main`, `--delete main` or `--mirror`, including inside a bundled command.
- writing-guard catches `noreply@anthropic.com` and "generated by" across any whitespace, and checks `gh pr review`, `gh issue create|comment|edit` and `gh release create|edit`.
- destructive-guard catches a credential directory delete without a trailing slash and `docker compose -f <file> down`.
- secret-guard expands glob operands and treats more commands as reads, and the secret and output guards resolve `~` and path separators the same way on every platform.
- bash-output-guard counts `tac`, `awk`, `nl`, a long `tail` and a whole-tree `grep` as whole-file reads, and read-guard caps an unbounded read by bytes as well as lines.
- `remove-worktree.mjs` turns git's refusal to remove a dirty worktree into a one-line error and leaves no `.exo/kept/<name>` behind, so a retry is not blocked.
- Plan files with CRLF line endings parse, check-ui ends a tag only outside quotes and braces, and export-signatures ignores comments and non-generic angle brackets.
- configure writes settings through a per-process temp file, and settings-store survives a malformed alias or plugin config file.
- ship matches closing keywords as whole words and validates `--issue`.
- `/exo:save-session` runs `handoff.mjs` from its skill directory, so it works in projects other than exo.
- find-cause's handoff anchor and closing rule, route-skills' refactor shim guard, start's verify row and build-task's Proof-script exception read correctly.
- check-docs' end-of-turn rule agrees with itself, remember proposes from the booked state, design-ui orders its critique after the baseline and names reference sections, and file-issues' step 5 points at `fields.md`.

## 0.70.3 - 2026-10-01

### Fixed

- bash-output-guard no longer loops to V8's string limit, costing about 1.7 s and 2 GB per call and failing open on a small heap, when a command ends in `(`, `)`, `;`, `<`, `>`, `|` or `&`.
- verify reruns its gate after the review fixer and commits the fixes only when it passes, so a fix that breaks a test no longer reaches ship labelled verified.
- The review fixer finds and runs each task's proof on compact plans, which put `Files:` and `Proof:` mid-line and have no `Run:`.
- git-guard denies a force push written as a `+refspec`, such as `git push origin +main`, and a `git` command after a `.git` word, such as `GIT_DIR=.git git reset --hard`.
- verify prints `UNRUN success-criterion` for `Land gate: none` instead of `PASS`, and runs a task's `npm test` or `node --test` proof unless the gate is the default `npm run check`.
- find-cause's fix delegate runs Steps 4 and 5 only, and may write the new failing test it lists under `Tests`.
- The skill description total is locked at its measured 3,321 chars, so description growth no longer passes unnoticed.
- The README, CONTRIBUTING, start, ship, find-cause and scannable docs no longer drift from the code: the README lists the `ship`, `workspace` and `guard_lines` settings, and a skill's own report format outranks the scannable caps.
- Fresh eyes gives its reviewer an absolute path to the critique checks, and verify tells the branch reviewers where the implementer reports are.
- git-guard denies a force-delete of a missing branch as "no branch named X" without calling `gh`, and read-guard no longer calls a read with a limit above the cap unbounded.

## 0.70.2 - 2026-10-01

### Fixed

- Heavy runtime learning no longer learns a command that reads remote state, such as `gh pr checks 12` or `curl https://x/health-check`, and counts only the program or script name as test-like, so exo no longer replays an old green CI result for up to 24 hours.

## 0.70.1 - 2026-10-01

### Fixed

- Heavy runtime learning no longer learns a shell wait loop or `sleep` command, which could replay an old green result instead of waiting for CI or a log.
- Heavy runtime learning measures a run with the tool's own `duration_ms`, so time spent on a permission prompt no longer marks a fast command as heavy.

### Changed

- The README and the configure skill now list every command heavy runtime learning never learns.

## 0.70.0 - 2026-10-01

### Added

- A test-like Bash command whose last run in a project took longer than the new `heavy_after_seconds` setting (default 60, 0 turns it off) runs through the heavy-run dedupe from then on, with nothing listed in `heavy_commands`.

## 0.69.1 - 2026-10-01

### Highlights

- **Every exo question now uses one lettered shape, with the recommendation always on A.** Spec asks in rounds until nothing is open, always ends on a brief, and never starts a build by itself.

### Changed

- The question shape lives in one file, `skills/route-skills/references/question.md`, and every question and script menu letters its options with the recommendation on A.
- Spec asks every open choice in rounds instead of assuming, and the brief drops its Assumptions section.
- Spec and find-cause end on a lettered pick; spec's pick offers to adjust the brief or build it here.
- The ship, workspace and configure menus use letters; configure puts Keep first as A.
- design-ui intake asks instead of assuming.
- Build stays silent between tasks, names the done tasks on a restart, and ends with every task as done or not done plus the manual checks.

### Fixed

- Build no longer starts by itself after a clear or compaction.

## 0.69.0 - 2026-10-01

### Added

- The `heavy_commands` setting names command prefixes, separated by `;`, that run at most once per code state across all sessions: a run on unchanged code within 24 hours returns the earlier green result at once, and a second session waits for one already running instead of starting another copy; `EXO_HEAVY_FORCE=1` before the command forces a run.

## 0.68.1 - 2026-10-01

### Changed

- The quality workflow runs one check, on Ubuntu with Node 24, and drops the Windows, macOS and Node 22 jobs.

## 0.68.0 - 2026-10-01

### Added

- The quality workflow runs the tests on Windows as a job that reports failures but never blocks a merge.
- The README states that Windows support is best effort and needs Git for Windows and Node.

## 0.67.0 - 2026-10-01

### Highlights

- **A verbose build, test or log command now runs with its output capped to the last 200 lines instead of being denied.** The command is rewritten to `set -o pipefail; <command> 2>&1 | tail -n 200`, so a failing command still exits non-zero.

### Changed

- Read, Edit, WebFetch and WebSearch calls each spawn one PreToolUse hook process, running the guards and the delegate budget together.
- The SessionStart hook runs in Node and no longer needs `jq`.
- The quality workflow runs on macOS as well as Linux, on the current Node.
- The quality workflow cancels a superseded pull-request run, stops a job after 15 minutes and skips the empty `npm ci`.
- design-ui moves body blocks into references to stay near its 2000-token aim.
- The effort twins' descriptions shrink to one sentence naming their base agent.
- All three manifests carry one plugin description, and the plugin-version check fails when they differ.
- Pressure cases run once on Sonnet by default, only when the skill they cover changes.

### Added

- Pressure cases for verify, save-session and check-docs.

### Fixed

- The two unreadable-file tests skip when running as root.

## 0.66.0 - 2026-10-01

### Highlights

- **The budget levels are now `high`, `medium` and `low`, with `medium` the default; a stored `full`, `normal` or `lean` still works and reads as the new name.** The hardest work (bug fixer, drift repairer, run-unit's repair, find-cause's investigator) now follows the budget too: Opus at `xhigh` under `high`, `high` under `medium` and `medium` under `low`.

### Added

- `exo:solve-hard`, with its generated twins `exo:solve-hard-high` and `exo:solve-hard-low`, carries out the hardest work in place of a `general-purpose` delegate on Opus, so its effort can follow the budget.

### Changed

- The `budget` setting's values are renamed `high`, `medium` and `low` from `full`, `normal` and `lean`; the old names stay accepted as aliases.
- The `xhigh` review twins are renamed `exo:review-branch-deep-high` and `exo:critique-ui-high`.

### Removed

- `exo:review-branch-deep-full` and `exo:critique-ui-full`, replaced by their `-high` names.

## 0.65.0 - 2026-10-01

### Highlights

- **The default `normal` budget now runs the deep branch review, the design critique and the hardest work at `high` effort instead of `xhigh`.** Set `budget: full` to keep the previous `xhigh` setup.

### Added

- A `full` budget above `normal` dispatches `exo:review-branch-deep-full` and `exo:critique-ui-full`, `xhigh` twins of the deep reviewer and the design critic.

### Changed

- The `review-deep` and `hardest` kinds run at `high` effort instead of `xhigh`, so `exo:review-branch-deep` and `exo:critique-ui` do too, under `lean` as well as `normal`.

## 0.64.3 - 2026-09-30

### Changed

- `spec`'s question rules read shorter, with one worked example, and ask the same way.

## 0.64.2 - 2026-09-30

### Changed

- `spec` asks its costly questions one per message, headed `Question 1`, `Question 2` and so on, with lettered options answered by letter, and lists its assumptions only under the last question.

## 0.64.1 - 2026-09-30

### Fixed

- The read guard's line limit setting is `guard_lines`, not `guard-lines`, so Claude Code loads the manifest again; a stored `guard-lines` value is ignored.

## 0.64.0 - 2026-09-30

### Highlights

- **`/exo:show-savings` is gone, and the next session start deletes the old savings data in `<config>/exo/savings`.**

### Changed

- The read and repeat guards switch on the `guards` setting and keep their per-session state in `<config>/exo/sessions/`, relocated by `EXO_SESSIONS_DIR`; the read guard's line limit is the `guard-lines` setting (default 400), so a limit set in the old savings config resets to 400.
- The read, repeat and delegate-budget guards live in `hooks/guards/`, and the paired benchmarks own the transcript usage and pricing helpers.

### Removed

- The `/exo:show-savings` skill, its ledger, report, status line segment, the savings counter switch and `EXO_SAVINGS`; the paired benchmarks stay the only token-savings measurement.
- The long-session restatement.
- The context warning and its `context` setting; a stored `context` value is ignored.

## 0.63.3 - 2026-09-30

### Changed

- A Bash call now spawns one hook process instead of two: the delegate budget and the context watch run inside the Bash dispatcher, after the guards, so a denied call is never counted.

### Fixed

- The read-guard pipe, savings-lock and sketch-tab server waits in the tests take under a second each, through `EXO_READ_GUARD_INPUT_MS`, `EXO_RECORD_LOCK_WAIT_MS` and `EXO_SKETCH_TAB_SERVER_GRACE_MS`; the defaults stay the same.

## 0.63.2 - 2026-09-30

### Changed

- exo registers 10 hook commands instead of 21: the Bash guards and bookkeeping, the prompt hooks and the Stop hooks each run in one process per event, with the same checks and messages.
- A build task lands on its own proof and `npm test`; the full `npm run check` runs once, in `verify`, before the review.
- `npm run check` runs its verifier self-test scenarios in parallel and parses only the scripts a scenario changes, cutting the check from about 219 s to about 30 s.
- `land-task` prints the next task after each land, so the build loop takes one call per task.
- exo's shared instructions teach command shapes that pass the harness's worktree isolation check: quoted runtime values, separate plain commands, and background waits instead of `sleep`.

### Fixed

- The lock-wait test uses a shorter write delay, and CI runs the verifier self-test on one Node version.

## 0.63.1 - 2026-09-30

### Changed

- At `terse`, the next-prompt note after a reply over the limit names that reply's stray article phrases, such as `the array`.
- The `terse` drift benchmark gates every chat turn on the text you read, not only turns 1, 10 and 11, and reports the model's raw rate beside it.

### Fixed

- At `terse`, a display filter removes the stray articles a reply still carries before you read it, leaving code, quotes, paths, tables and questions as written; the transcript and the model keep the original text.

## 0.63.0 - 2026-09-30

### Added

- A 12-turn `terse` drift benchmark that scores the article density of chat prose per turn and fails a turn over 2.0 articles per 100 words.

### Changed

- The `terse` rule bans the exact words it drops (a, an, the, is, are, was, were), loses its escape clause, gains an example, and repeats as a one-line reminder with every prompt.
- At `terse`, a Stop hook scores each reply, and when one runs over 2.0 articles per 100 words the next prompt's reminder names that score and shows one of its sentences with the articles removed. In a 12-turn Opus 5.5 run at `high`, chat prose over turns 1-11 fell to 1.0 articles per 100 words, from 4.5 with the reworded rule alone and 9.6 before; 1 of 3 runs passed, and the other two failed only turn 11.

### Fixed

- Tests keep the developer's own exo settings out of the scripts they spawn.

## 0.62.0 - 2026-09-30

### Highlights

- **Safety guards now ship with exo and are on by default: they deny force pushes, destructive deletes, detached processes, shell reads of protected paths, AI attribution and non-conventional commit subjects, and cap long output.** Set `guards` to `off` through `/exo:configure` to turn them all off.

### Added

- A `terse` reply level, a lone `?` prompt that restates the last reply in full, and the `exo:scannable` output style.
- Six PreToolUse guards under `hooks/guards/`, switched by one `guards` setting, which take their protected read paths from your own `permissions.deny` entries.
- The code standard and project structure as `route-skills` references read before an edit, and the instruction style as an `edit-skills` reference.
- One benchmark arm per reply level, and a README section on the reply levels, the scannable style and the guards.

### Changed

- The branch review falls back to exo's own code standard when the repository names none.
- The generic session rules (read-only questions, a delete that would unblock reports options, progress lines, stop after two failed attempts, the delegate brief shape) now live in `route-skills` and its references.
- Under `replies=terse`, a dispatch asks the delegate for a terse return.

## 0.61.5 - 2026-09-30

### Fixed

- The build, bug-fix and find-cause fix delegates run a long proof in the foreground or wait with a bounded `for` loop, never with `Monitor`, which a session can disable, or a leading `sleep`, which the harness blocks.

## 0.61.4 - 2026-09-30

### Fixed

- `run-unit` waits for each build's report with `wait-report.mjs` instead of `sleep`, because the Agent tool ignores `run_in_background: false` when the fork gate is on, and the harness blocks a leading `sleep`.

## 0.61.3 - 2026-09-30

### Changed

- The deep branch review, the design critique and the hardest-fix kind run Opus at `xhigh` instead of `max`, which scores 56 against 58 on the Artificial Analysis index at about 58% of the cost per task.

## 0.61.2 - 2026-09-30

### Fixed

- `build` names the plan in its commit trailer (`Plan-task: <plan-id>/<n>`), so a branch that stacks several plans no longer counts an earlier plan's tasks as landed for a later one. A legacy bare `Plan-task: <n>` still counts when the commit subject matches the task's.

## 0.61.1 - 2026-09-29

### Fixed

- `build` no longer asks the lead for `run_in_background: false`, which the harness overrides. After a dispatch the lead ends its turn, resumes on each completion notification, never polls with `ScheduleWakeup`, `ListAgents`, `Monitor` or `sleep`, and lands a wave only after every sibling returned.
- The `resume-plan` and `proof-check` Stop hooks no longer block a turn that ends while a background agent or command has not yet sent its completion notification. The block forced an extra turn in which the lead polled.

## 0.61.0 - 2026-09-29

### Added

- `skills/build/scripts/remove-worktree.mjs --kept` copies a worktree's `.exo/` into `.exo/kept/<name>/` in the run's checkout. It refuses and removes nothing when that folder already exists.

### Fixed

- The worktree tidy in `CLAUDE.md` removes each worktree through `remove-worktree.mjs --kept`. A plain `git worktree remove` deleted the excluded `.exo/` scratch folder with exit 0.

## 0.60.0 - 2026-09-29

### Highlights

**`ship` now pushes a non-default branch to its remote without asking, never forced; a merge, a default-branch push, a release, a delete, a pull request, an issue or a comment still asks, and the `ship` setting overrides both.**

### Added

- On a plan above eight tasks, `build` logs each choice a builder made that the plan left open, in a file beside the plan.
- `/exo:start <goal>` routes a one-line goal to the right stage and chains spec, build, verify and ship with no further command.
- A plan task whose change shows at runtime proves it by running the artifact with a re-runnable script, not only its unit tests.
- On a plan of eight tasks or fewer, `build` runs independent tasks in parallel waves, limited by the plan's `Parallel:` line.
- `land-task` refuses a task whose changed exported function would break a caller outside its files, and routes it to drift repair.
- The pressure runner takes `--main-dir` to compare against exo at main, `--setting-sources` to isolate user settings, and flags a run that loaded the wrong exo copy.

### Changed

- A plan without a `Parallel:` line builds its tasks one at a time.

### Fixed

- `land-task` refuses a task whose build report lists a failing command under Proof.
- The pressure runner resolves `--plugin-dir` to an absolute path, so a relative path no longer loads the installed exo instead.

## 0.59.2 - 2026-09-29

### Fixed

- Hooks read their input from stdin asynchronously, so a hook that starts before the harness writes its input no longer fails with `EAGAIN` and does nothing; a guard that cannot read its input reports it on stderr and exits 1.

## 0.59.1 - 2026-09-29

### Changed

- A question offers at most three options under one line saying what happens without an answer; ship's finish menu drops Push, which the `ship=push` setting still reaches.

## 0.59.0 - 2026-09-29

### Highlights

- **Once the context passes the `context` setting, exo hands the rest of the task to a fresh agent and keeps working, without asking you to save, clear or stop.**

### Added

- `lib/model-kinds.json` lists every model a provider offers (`fable` included), accepts `inherit` for the session's own model, and adds `xhigh` to the effort ladder.

### Changed

- Past the `context` threshold, the context notice reaches only the model and tells it to hand the task over to a fresh delegate, not to ask for `/exo:save-session` and `/clear`.
- The next-stage question keeps the next stage first after a context notice.
- `budget: lean` resolves its models from the kind table, so no model name is written into the setting's text.
- A task delegate runs only its proof, and the lead runs the full gate (the plan's `Land gate:`) once at landing, in the background.

### Fixed

- The model-kinds check finds a dispatch line on `inherit` or on a model only listed under `models`, instead of throwing on the next run.
- The README settings table lists the `budget` setting.

## 0.58.0 - 2026-09-29

### Highlights

- **One table, `lib/model-kinds.json`, now sets the model and effort for each kind of task, and `npm run models` writes it into every agent, skill and dispatch line.**

### Added

- `lib/model-kinds.json` names ten task kinds (build, hardest, review, review-deep, investigate, coordinate, research, lookup, prose, chore), each with a provider-neutral tier (`strong`, `standard`, `fast`) and effort that a `claude` provider block maps to a model and effort, and `npm run check` fails when a member file drifts from it.
- `exo:review-branch-deep` reviews a branch above the size limit on `opus` at `max`, generated from the one `review-branch` body.

### Changed

- `critique-ui` runs at `max` effort, `fetch-docs` at `medium`, and the no-plan build recommendation names `opus` at `max`.
- The `budget` setting, the reviewer pick, the next-stage model lines and the agent tests read their models and agent names from the kind table.
- The nine agents follow Anthropic's subagent guidance: descriptions say when to use them, tools match what each body uses, each body restates the rules it relies on, and each return holds only what its caller reads.

### Removed

- `verify/model-table.json`, the per-file mirror of agent and skill frontmatter, which the kind table replaces.

## 0.57.0 - 2026-09-28

### Highlights

- **Plan a change with `spec` and build it with `build`, which replace `define-scope`, `run-plan` and `build-change`.**
- **Seven skills are removed: `tune-metric`, `try-idea`, `run-parallel`, `explain-code`, `compare-renders`, `check-impact` and `audit-architecture`.**

### Added

- `skills/edit-skills/scripts/rename-skill.mjs` moves a skill folder, its docs page and its pressure cases to a new name, then rewrites every word-bounded mention of the old name outside `CHANGELOG.md` and `benchmarks/results/`.
- `skills/verify/scripts/verify.mjs` runs each landed task's `Proof:` command, the plan's `Land gate:` command and a check for changed paths outside the `Files:` a task named, all measured against the branch base. It ends on `REVIEWER: sonnet` or `REVIEWER: opus`, picked by the size of the diff.
- `land-task.mjs` runs the plan's `Land gate:` command before it commits, and its `--fix` mode commits the branch review fix. `next-task.mjs --frame` prints the plan frame.
- `spec` writes a `Land gate:` line when `package.json` has a `validate` or `check` script, and `plan-check.mjs` flags a plan that leaves it out.
- `npm run check` caps the stage-path skill bodies, every agent body except `build-ui`, `survey-ui` and `critique-ui`, and the references and prompts those stages load at 750 tokens. A file above the cap is locked at its measured size and may only shrink.
- `skills/build/scripts/remove-worktree.mjs` copies a worktree's `.exo/` files into the run's `.exo/` before it removes the worktree.
- `benchmarks/results/2026-09-28-lean.md` records the pressure scores of `spec`, `build`, `find-cause` and `ship` beside the previous scores.
- `plan-check.mjs` fails a plan whose `## Acceptance` item names no task number, `Data:` segment, success criterion or manual check.

### Changed

- `define-scope` is renamed `spec`, and `run-plan` is renamed `build`.
- `build-change` is folded into `build`, which runs a decided change with no plan file through its own No spec steps.
- `build` dispatches one `build-task` per task for a plan of at most eight tasks, and one `run-unit` per block of eight above that.
- `review-branch-deep` is merged into `review-branch`, which runs on `sonnet` or `opus` as `verify.mjs` prints.
- The `spec`, `build`, `find-cause` and `ship` skills and the `build-task`, `run-unit`, `review-branch`, `locate-code` and `fetch-docs` agents are shorter. `run-unit` runs at effort medium.
- `ship` runs `verify` instead of its own verifier prompt.
- The routing context injected at session start describes the three stages.
- The next-step menu labels the build option `Build`.
- `spec` scores below the old `define-scope` on pressure case A, 29/33 checks against 33/33 over three runs: a run repeats the user's answer before it writes the brief, names a technical term in a question, or puts context above the first question. Case D scores 33/36 on both.

### Removed

- `tune-metric`, `try-idea`, `run-parallel`, `explain-code`, `compare-renders`, `check-impact` and `audit-architecture`, with their docs pages, tests and pressure cases.
- `skills/build/scripts/finish-run.mjs` and its test. `verify.mjs` prints the reviewer instead.

### Fixed

- `land-task.mjs` refuses a checkout whose top level differs from `--root`.
- `rename-skill.mjs` no longer rewrites a name inside a longer hyphenated name, such as `build` inside `build-task`.
- `run-unit` no longer lands a task on a build report it wrote itself.
- `verify.mjs` no longer hands a prose `Proof:` line to a shell.
- `lib/size-facts.mjs` reads a renamed path in `git diff --numstat` output as its old and new path.

## 0.56.0 - 2026-09-28

### Added

- The README opens with the social preview image, stored at `assets/social-preview.jpg`.

## 0.55.1 - 2026-09-26

### Fixed

- `build-change` counts a change as done only with a `Proof: <command> -> <output>` line from a product run, not a test runner, on input the session did not write, else `Unverified: <reason>`; a Stop hook blocks the final message until it has one.
- `run-plan`'s workspace reference now matches the git-init menu: a stop that an init would fix asks init here or another folder and edits nothing before the answer, and every other stop ends the turn on its reason.

## 0.55.0 - 2026-09-26

### Added

- `benchmarks/pressure/build-change/` and `benchmarks/pressure/find-cause/` hold three pressure cases each for rules that 0.54.0 dropped. Build-change cases 2 and 3 are marked weak, because a run without exo passes them too.
- `benchmarks/pressure/drive.mjs` takes `--label <text>` to keep repeated runs of one case apart and `--plugin-dir <dir>` to load the `with` arm from another exo clone.
- `verify/checks/process-structure.mjs` fails a slim skill whose opening heading starts with a paragraph instead of its first step.

### Changed

- `drive.mjs` and `skills/edit-skills/scripts/pressure.mjs` run with `--strict-mcp-config`, so the host's MCP servers no longer steer a pressure run.

### Fixed

- `define-scope`'s `task-list.md` rule 1 lists a symbol, not only a path, only after reading its range here or in an `exo:locate-code` report.
- `build-change` again holds the comment rule and counts a change as done only with a commit and proof on the real product.
- `find-cause` again names the missing infrastructure, reproduces at the first repository-owned function below it, and claims no sign-off for the path that did not run.
- `find-cause` again sends a fix to review when it needed an unread file or cannot be followed in one reading, and drops an earlier symptom patch instead of keeping it as a backstop. Its body lock in `verify/budgets.mjs` rises from 1166 to 1289 tokens to hold these rules.
- `verify/checks/reference-tables.mjs` again pins the four first-line clauses it had dropped, each with a self-test attack.
- `finish-run.mjs` resolves the default branch when `origin/HEAD` is unset, trying `init.defaultBranch`, `main` and `master` on origin and then locally.
- The header comment of `hooks/session-start.sh` lists the order in which the hook injects its text.
- `tests/size-facts.test.mjs` names its test after the `requirements.txt` body it checks.
- `check-ui.mjs` reads a computed colour's alpha from the colour string through `parseComputedColor()`, because obscura's canvas squared it and a translucent border or text blended as nearly transparent. It also treats an empty `backgroundImage` or `mixBlendMode` as unset.

## 0.54.2 - 2026-09-26

### Fixed

- `design-ui`'s `check-ui.mjs` reloads the page for every viewport, so focus left by the previous viewport's Tab pass no longer reports a false `focus-indicator-missing`.
- `design-ui`'s `check-ui.mjs` blends a translucent border or text color over its background before measuring contrast, and skips a fully transparent border, so `border-transparent` no longer reads as black.

## 0.54.1 - 2026-09-26

### Fixed

- `define-scope` sorts tasks into risky and routine again outside plan mode, because `test-design.md`'s first line no longer limits that to plan mode.
- `define-scope` reads `question-shape.md` before writing the bundled message, so its shape holds again.
- `define-scope`'s `task-list.md` again keeps a check only the user can make out of the tasks, as a `## Manual checks` line.
- `build-change` and `find-cause` skip their fresh-eyes review only when the caller says a pull-request review follows.
- `build-change` reports a `BLOCKED` review and leaves it open instead of having no route for it.
- `build-change`'s `test-first.md` again accepts the closest executable check when the red run needs infrastructure the repository lacks.
- `find-cause` fixes each confirmed `code-review` finding under Step 5's proof before committing.
- `performance.md` measures before any hypothesis or edit.
- `ship.mjs` offers and runs the push route when origin's default branch is unknown; only `open-pr` and `pr-merge` need it.
- `land-task.mjs` no longer counts the uncommitted plan file inside the checkout as a stray path.
- The verifier self-test's slim-shape attacks stay within the body lock, so they reach the slim check instead of the size check.

## 0.54.0 - 2026-09-26

### Highlights

**`define-scope`, `run-plan`, `build-change`, `find-cause` and `ship` are cut to at most 700 words each, and the session-start text drops from 4501 to 2141 bytes.** The right-sizing ladder is no longer injected at session start; it lives in `skills/route-skills/references/ladder.md`.

### Added

- `lib/workspace.mjs` decides where a run commits (`commit-here`, `init`, `stop` or `ask` with its menu) and carries out a `--pick`; `run-plan`'s `workspace.md` is a five-line pointer to it.
- `run-plan` opens a run with `start-run.mjs`, which finds the plan, writes the `run-plan.active` marker and excludes scratch, and closes it with `finish-run.mjs`, which picks the reviewer from the merge-base and removes the marker.
- `ship.mjs --routes` prints the allowed finish menu from origin, the default branch, `gh auth status` and the `ship` setting, and `--verdict-current <patch-id>` says whether a recorded verdict is still current.
- `lib/size-facts.mjs` prints changed files, changed lines, an added dependency and `small` or `large`; `pick-reviewer.mjs` counts through it.

### Changed

- `land-task.mjs` refuses with exit 1 when the diff holds a path outside the task's `Files:`, replacing the hand check in `agents/run-unit.md`.
- `plan-check.mjs` fails a `Modify:` path that does not exist and a `Files:` path two tasks share without a `Depends on` chain; `task-list.md` rules 1 and 4 are shorter.
- `route-skills` moves Right-sizing to `references/ladder.md` and Context to `references/context.md`; `agents/build-task.md` and the README point to `ladder.md`, and the injected budgets are lowered.
- `security.md`, `data-migration.md` and `test-design.md` open with their own read-when line, and the shared "Retain project knowledge" rule lives in `build-change/references/project-knowledge.md`.
- `define-scope`, `run-plan`, `build-change`, `find-cause` and `ship` keep only frontmatter, numbered steps, the References table and a closing `Report:` line, calling the new scripts instead of hand-run steps.
- The verifier holds those five skills to the slim shape and locks each body at its trimmed size, so growth fails.

## 0.53.0 - 2026-09-26

### Added

- `start` routes a spec or big wish to build, and `/exo:start <spec-path>`, to `define-scope`, which writes the brief with its task list and goes straight on to `run-plan`.

### Changed

- The README drops the `autoCompactWindow` step and asks for a `CLAUDE_CODE_MAX_SUBAGENT_SPAWN_DEPTH` of at least 2, which Claude Code 2.1.219 and later meet by default.

### Fixed

- At the soft budget limit an `exo:run-unit` agent is told to land the task in flight and go on with the next task instead of writing its report; other agents keep the old note, and `agents/run-unit.md` drops its line telling the unit to ignore it.

### Removed

- The empty `skills/drafts/` staging folder and its README and CONTRIBUTING paragraphs; the checklist for adding a skill stays.

## 0.52.0 - 2026-09-26

### Highlights

- **`run-plan` hands each block of at most eight tasks to a fresh `run-unit` agent, so the main session stays small without compaction; it needs `CLAUDE_CODE_MAX_SUBAGENT_SPAWN_DEPTH` of 2 or more.**

### Added

- `agents/run-unit.md` builds and lands one block of at most eight plan tasks through `exo:build-task` and returns at most ten `LANDED` or `BLOCKED` lines; a question for the user comes back as `BLOCKED` and `run-plan` asks it.
- `benchmarks/pressure/run-plan/` holds a pressure case with a twelve-task spec that needs two unit agents.

### Changed

- `run-plan`'s main session only splits tasks into blocks, dispatches unit agents, relays `BLOCKED` questions and re-dispatches on `BUDGET`; it never builds or lands a task itself.
- The session context tells the main session to give a delegate's `BUDGET:` return to a fresh agent for the open part and never finish it itself.
- `define-scope` writes no manual task: a check only the user can do goes under `## Manual checks` in the brief, and `run-plan` and `build-change` end their final report with that list.

### Fixed

- A delegate past its tool-call budget is told to stop and return a `BUDGET: done …; open …; next …` line instead of retrying blocked tools, and can still commit through `git -C <path>`.
- `context-watch` no longer claims the harness compacts the context on its own.
- `land-task.mjs` reads a build report's `<command>: pass` line and its output at any indentation, across blank lines, trailing whitespace and CRLF, so a green build is no longer refused and built twice.
- `run-plan` treats a unit's `BUDGET:` return as unfinished whatever its `done` list says: it asks the branch what landed and gives the rest to a fresh unit.
- A unit dispatches its builds in the foreground and returns only when every block task is `LANDED` or `BLOCKED`, or at the hard budget limit; the soft budget note no longer ends it, and `exo:run-unit` gets a 70k soft limit and 90 tool calls.
- `run-plan` dispatches each unit in the foreground and waits on its return instead of polling for commits.
- The Stop hook no longer blocks while a run waits on the user: `resume-plan.mjs wait` marks the wait, and the next stop passes once.

### Removed

- `docs/skills/draft-plan.md`, and the last draft-plan references in `docs/skills/audit-architecture.md`.

## 0.51.0 - 2026-09-26

### Highlights

- **exo has no separate plan stage anymore: `define-scope` writes the brief with a task list and continues into `run-plan` in the same session.**
- **The question after a stage recommends continuing, and recommends Stop with a clear only once the context notice fired in the session.**
- **A task counts as done only with its commit SHA and the passing output of its proof command.**

### Changed

- `define-scope` ends its brief with a task list in the compact task format, each task naming its files, dependencies and one `Proof:` command, checks it with `plan-check`, and continues into `run-plan` on that brief; `run-plan` runs a brief as its plan and stops to ask when a task needs a product decision the brief does not name.
- The question after a stage puts continuing in this session first as the recommended option; Stop with a context clear becomes the recommended option only after `context-watch` warned in this session.
- `run-plan`'s `land-task.mjs` refuses to land a task whose build report lacks a pass line with output for its proof command, a skipped or unclear proof counts as not done, `find-cause` and `build-change` commit the reproduction test before the fix, and `review-branch` and `review-branch-deep` check each task's files and proof.

### Removed

- The `draft-plan` skill, the 30-line cap on a plan and phase files: `plan-check` moved to `define-scope` and checks a brief's task list, `build-change` with two or more order dependencies writes a task-list brief through `define-scope`, and in plan mode `define-scope` writes the brief into the plan file the harness names.

## 0.50.5 - 2026-09-26

### Fixed

- `build-task` and every `run-parallel` worker check with `git rev-parse --show-toplevel` that they stand in the checkout their dispatch names before the first edit, stop with `BLOCKED` when they do not, and give Edit and Write only absolute paths inside it.
- `run-plan` and `run-parallel` compare `git status --porcelain` of the main checkout before and after each wave, and land nothing when a wave left it dirty, listing the files.

## 0.50.4 - 2026-09-26

### Changed

- `run-parallel` builds each worker in a worktree it makes with `git worktree add --detach`, never with the dispatch tool's worktree isolation, names each worker's brief by path, and has a worker `cd` into its checkout and return its report of at most 25 lines as its final message.

## 0.50.3 - 2026-09-26

### Changed

- `run-plan` always builds a wave in folders it makes with `git worktree add --detach`, never with the dispatch tool's worktree isolation, and every build brief is named by path, never pasted, which saves about 6.7k lead tokens per eight tasks.
- `run-plan` and `build-change` keep no harness task list; `Plan-task:` commits and the working tree track what landed.

## 0.50.2 - 2026-09-26

### Changed

- `run-plan` keeps one harness task-list entry per run and updates it once per wave or lone task, instead of one entry and update per plan task, because `Plan-task:` commits already track which tasks landed.

## 0.50.1 - 2026-09-26

### Fixed

- `lib/scratch-path.mjs` treats an argument whose last segment has an extension, such as `report.md`, as a file and creates only its parent folder, so a later Write no longer fails with "is a directory".
- An agent that `run-plan` or `run-parallel` dispatches with worktree isolation returns its report as its final message, at most 25 lines, because the harness removes an isolated worktree with no commit, and its `.exo/` report with it.

## 0.50.0 - 2026-09-26

### Added

- `lib/scratch-path.mjs` prints and creates a checkout's own `.exo/` scratch folder, and `lib/scratch-exclude.mjs` adds `.exo/` to the shared `info/exclude` once.

### Changed

- `route-skills` says to create a file with the Write tool, never a compound Bash command, and to log long output under `.exo/`.

### Fixed

- Agents and delegates of `run-plan`, `build-change`, `find-cause`, `run-parallel` and `audit-architecture` write their reports and briefs under `.exo/` in their own checkout instead of the git directory, so a worktree agent no longer stops on "too complex to verify that it stays inside the worktree".

## 0.49.0 - 2026-09-26

### Added

- `draft-plan --run` continues into `run-plan` in the same turn instead of asking.
- `run-plan` moves from a phase's last task into the next phase file by itself, and the tail runs once, after the last phase.
- A Stop hook keeps a running `run-plan` going while its plan has open tasks, and the session hook names the running plan after a clear or compaction; the run marker belongs to one session and expires after six hours.
- `ship` and `workspace` settings let `ship` and `run-plan` skip their route and workspace questions; the conflict question stays.

### Changed

- `draft-plan` hands each phase of a plan with two or more phases to a fresh subagent that writes its own phase file, and a phased plan's repair goes to a subagent too.
- `context-watch` tells a session inside `draft-plan` or `run-plan` to keep working instead of saving and clearing, and its user notice follows the `context` setting instead of a fixed 150k.
- `run-plan` keeps working after an `exo: context` line.

### Fixed

- The README sets `autoCompactWindow` as the string `"120k"`.

## 0.48.9 - 2026-09-26

### Changed

- `run-plan` compares a task's changed paths with its `Files:` instead of reading its diff.

### Fixed

- A compact task whose report carries a further `pass` line for a check the task did not name stays green, so one extra check no longer discards its wave.

## 0.48.8 - 2026-09-26

### Highlights

- **`run-plan` runs only each task's targeted test and the project's full check once, at the end of the run.**

### Changed

- A wave takes every ready task whose `Files:` paths are disjoint, four at most, instead of two.
- `run-plan` reads each task's diff before it lands and treats a change outside the task's `Files:` as not green.
- The tail of `run-plan` runs the branch review first and the full check once after it: `## Final verification` for a long plan, `## Success criterion` for a compact plan.
- `run-plan` reads a compact plan's `## Success criterion` and `## Checkpoint` in its frame.

## 0.48.7 - 2026-09-25

### Highlights

- **A build dispatch is under 500 words: `build-task` builds a compact task from its `Files:` and `Data:` and proves it with one targeted test for the plan's success criterion.**

### Changed

- `build-task` is rewritten as short imperative rules under Scope, Build, Git, Stop and Report headings, from 1,238 to 477 words, and the implementer prompt lists its fields one per line.
- The brief `next-task` writes carries the plan's `## Success criterion` as a `Success criterion:` line after `Goal:`.

## 0.48.6 - 2026-09-25

### Highlights

- **`draft-plan` writes a compact plan of at most 30 non-blank lines: goal, plan basis, success criterion, a four-point checkpoint and one field line per task.**

### Changed

- A plan task is its conventional-commit heading plus one line `Depends on: … | Files: … | Data: …`, with an optional `Design:` segment; steps, `Run:`, `Expected:` and `Commit:` blocks are gone from new plans.
- `land-task` derives a compact task's commit from its heading, its `Files:` paths and the `Plan-task:` trailer; a plan in the long format still runs as before.
- `plan-check` holds a compact plan to 30 non-blank lines and requires `## Goal`, `## Plan basis` with `Repository:` and `Branch:`, `## Success criterion` and all four `## Checkpoint` points.

## 0.48.5 - 2026-09-25

### Highlights

- **`define-scope` now asks every costly question in one message, lists routine choices as assumptions, and writes the brief after a single reply.**

### Changed

- `define-scope` sorts each open point as costly (asked), testable by running (`try-idea`) or routine (an assumption line); `ok` accepts everything, and a question a reply skips takes its recommendation.
- `define-scope` drops the separate checkpoint round; the reply to the bundled message confirms the brief.
- The brief holds Goal, Decisions, Assumptions and Acceptance, plus Visual direction for a new screen; Problem, Out of scope and Proof are gone.
- `file-issues` fills a Spec's `### Assumptions` from the brief and no longer maps Problem, Proof or Out of scope to brief sections.
- A fourth `define-scope` pressure case checks that one costly and three routine points yield exactly one question.

## 0.48.4 - 2026-09-25

### Highlights

- **`run-parallel`'s rubric-judged shape is now called `contest`, and `ship` now says it watches a pull request.**

### Changed

- Breaking: `run-parallel`'s rubric-judged shape is renamed `contest`, and its run directory moves to `<git dir>/exo/run-parallel/`.
- `ship` calls following a pull request to merge-ready watching, from `references/watch.md`.
- `/exo:start` lists each skill by its current name only, without an old name.
- Skill headings, prompts, pressure fixtures and past changelog entries use exo's own skill names instead of names borrowed from other plugins.
- The `derivation` check scans every tracked text file, not only shipped ones, and forbids 15 more borrowed names.

## 0.48.3 - 2026-09-25

### Changed

- `CLAUDE.md` deletes run branches only in a separate command after a successful push, because git-guard checks the whole command before the fast-forward runs.

## 0.48.2 - 2026-09-25

### Fixed

- The README `### User-invoked` sentence gives a true reason for every skill that carries `disable-model-invocation: true`.

## 0.48.1 - 2026-09-25

### Changed

- `CLAUDE.md` requires a deadline counter in every shell wait loop, so a subagent never leaves an `until ... sleep` loop running forever.

### Fixed

- `CONTRIBUTING.md` names all seven skills that carry `disable-model-invocation: true`, not only `save-session` and `remember`.

## 0.48.0 - 2026-09-25

### Added

- `start` (`/exo:start`) lists every skill in plain words with its old name, rare skills apart, and `/exo:start <goal>` picks and runs the skill for that goal.

### Changed

- The README skill tables say in plain words what each skill does and what to say instead of its name, with rare skills apart.
- `route-skills` runs only when typed, because the session hook already injects its rules at every start, clear and compaction.

### Fixed

- The `remember` correction nudge no longer fires on a background-agent notification, which reaches the prompt hook as if it were user input.

## 0.47.0 - 2026-09-25

### Added

- `benchmarks/pressure/drive.mjs` runs a define-scope pressure case over several turns, and the pressure README says how to run it.

## 0.46.0 - 2026-09-25

### Added

- `verify/model-table.json` holds the model and effort of every skill and agent, checked by verify, and a `budget` setting (`normal`, `lean`) makes a lean session dispatch an opus agent on sonnet.

### Changed

- `find-cause` resumes its fix delegate with SendMessage on a plain retry instead of starting a fresh one.

### Fixed

- The `define-scope` pressure criteria credit a checkpoint decision to plain `code`, as the skill does, instead of `code: <path>`.

## 0.45.0 - 2026-09-25

### Added

- Three multi-turn pressure cases for `define-scope` under `benchmarks/pressure/define-scope/`, with their fixtures and pass criteria.

### Changed

- `define-scope` marks the recommended option the way the active output style does, and `(recommended)` only without one.
- `define-scope` questions put the reason on its own line under the options, name nothing from the code, open on the question itself, and end on the same reply line at the checkpoint.

## 0.44.0 - 2026-09-25

### Changed

- `define-scope` calls its questioning step the interview instead of the grill.
- `define-scope` asks one question per message, the decision others depend on first, and no longer repeats the previous question or its answer.
- `define-scope` questions use everyday words with two or three one-line options, the recommended one first with a one-line reason, answered by a digit, own words or `go`.

### Removed

- The `define-scope` interview web page and its decision-map scripts; `configure` asks its setup in chat.
- The `interview` setting (`chat` or `page`); a leftover `interview` key in a settings file is ignored.

## 0.43.0 - 2026-09-25

### Highlights

**Breaking: every exo skill and agent has a new name, and the old names no longer resolve.** Replace each `exo:<old>` in your prompts, settings and CLAUDE.md with its new name from the Changed list below. **exo is now MIT licensed.**

### Added

- `npm run overlap -- <dir>...` lists every run of eight prose words that a skill or agent file shares with the Markdown under the given directories, with file and line on both sides, and skips code, commands and file names.

### Changed

- Passages in `ship`, `find-cause`, `refactor`, `run-parallel`, `try-idea`, `tune-metric` and `write-docs` that followed an external skill collection word for word are rewritten in exo's own words, with the same rules.
- Breaking: skills renamed `debug` to `find-cause`, `deepen` to `audit-architecture`, `designing` to `design-ui`, `handoff` to `save-session`, `implementing` to `run-plan`, `implementing-batch` to `build-change`, `issuing` to `file-issues`, `memory` to `remember`, `planning` to `draft-plan`, `prototyping` to `try-idea`, `research` to `check-docs`, `savings` to `show-savings`, `settings` to `configure`, `shaping` to `define-scope`, `shipping` to `ship`, `skills-tool` to `edit-skills` and `using-exo` to `route-skills`.
- Breaking: agents renamed `branch-reviewer` to `review-branch`, `branch-reviewer-deep` to `review-branch-deep`, `design-builder` to `build-ui`, `design-critic` to `critique-ui`, `design-discovery` to `survey-ui`, `explorer` to `locate-code`, `implementer` to `build-task` and `researcher` to `fetch-docs`.
- `edit-skills` names every skill and agent as an imperative verb phrase of one or two words.
- The license is MIT instead of PolyForm Noncommercial 1.0.0.

### Removed

- The old skill and agent names, with no alias: a call to `exo:<old>` or an old `subagent_type` no longer resolves.

## 0.42.2 - 2026-09-25

### Fixed

- `explain-code` fires on a request to teach code to someone and on a reason a comment gives, and an asker who waives the git history still gets the commit that set the value checked.
- `write-docs` keeps a changelog written to show off to the facts the input states, and a Highlights line or summary to one change.

## 0.42.1 - 2026-09-25

### Changed

- `explain-code` fires on how code works, why it is so, a request to explain or confirm it, and a stated reason checked as a PR verdict or in a runbook, ADR or doc; `check-impact` leaves how and why questions to it.
- `skills-tool`'s loop step 1 and pressure-scenarios step 5 save each case in `benchmarks/pressure/<skill>/` with its criteria and fixture setup, instead of keeping it out of the repository.

## 0.42.0 - 2026-09-25

### Added

- `benchmarks/pressure/` keeps the pressure cases of `explain-code`, `refactor`, `check-impact` and `write-docs`, each with a fixture setup and a pass criterion per case, so they can be rerun.

### Changed

- `skills-tool`'s `pressure.mjs` writes every full answer to its own file instead of printing the first 300 characters, lists the skills each run invoked, and repeats each cell `--runs` times, 3 by default.

## 0.41.0 - 2026-09-25

### Added

- `check-impact` proves what a change breaks outside its diff by running the real code before it merges or before a design builds on a claim about existing code, and tags each safety claim with how far it was proven.
- `write-docs` holds prose read later, a README, doc page, pull request, issue or commit body, changelog line, brief or spec, to one documentation mode, the plain word and a catalogue of machine-sounding tics.
- `run-parallel`, user-invoked, fans one job out to parallel workers for split coverage, a race, a gauntlet of checks or a contest of candidates judged against a rubric fixed before they run.
- `tune-metric`, user-invoked, pushes one metric toward a target in an unattended keep-or-revert loop against a frozen harness, with an append-only decision log audited by a second model.
- `compare-renders`, user-invoked, proves a refactor, migration or dependency bump changes no pixel, from a baseline captured before the first edit and an exact pixel diff.

### Changed

- The locked description total rises by the two model-invoked descriptions only, from 4,608 to 5,128 characters.

## 0.40.3 - 2026-09-25

### Changed

- `shaping` names the owning layer with one caller, data owner or convention that places it, carries a change through every place it touches instead of bolting it on, and reads a new architecture-sketch reference when two or more structural shapes are open.

## 0.40.2 - 2026-09-24

### Changed

- The right-sizing ladder's Need rung first deletes the branch, duplicate or path the change makes obsolete.
- `implementing-batch` settles shared types before ordering edits, keeps every mutation idempotent, scripts a repeated hand edit, turns a recurring correction into a check before a note, allows a closest executable check when a red test needs missing infrastructure, and critiques boundary validation and domain modeling.
- `debug` reads a new profiling reference for a slowdown, memory growth or a captured profile or trace.
- `planning` logs each tried hypothesis with its evidence, splits a shared write target before tasks run independently, steers an internal migration straight to its end architecture, and groups a multi-phase plan under phase headings.
- `prototyping` builds two or three structurally different variants when no precedent and no single build settles the question.
- `handoff` pauses at a safe boundary with a `wip:` commit on a non-default branch, writes resume rules into every note, and reconstructs state from git and open pull requests when no note exists.
- `memory` proposes the strongest fix, a check, script or skill edit, before booking a claim.
- `skills-tool` adds a blind judge step for a close pressure-scenario call.
- `branch-reviewer` and `branch-reviewer-deep` flag narrative comments and unexplained suppressions, runtime checks for states a type could rule out, and validation past the system boundary.

## 0.40.1 - 2026-09-24

### Fixed

- `explain-code` now loads when a code reason is wanted for an ADR or doc, so an asker's or lead's theory no longer lands there as fact.

## 0.40.0 - 2026-09-24

### Added

- `explain-code` answers how, why and teach questions about the repository read-only, from code read this session and its git history, with every claim marked verified, inferred or unknown.
- `refactor` runs a named refactor whose behavior must not change: behavior pinned before the first move and proven equal after, every internal caller migrated and the old API deleted in the same change, no forwarding shim.

### Changed

- `deepen` hands a single named refactor to `refactor` instead of `implementing-batch`.

## 0.39.2 - 2026-09-24

### Fixed

- The `skills-tool` pressure runner's without arm disables the installed copy of the clone's plugin through `--settings` `enabledPlugins`, read from the clone's manifests, so a globally installed exo no longer loads in that arm.
- `npm run check` no longer leaves a `benchmarks/results/<date>-sweep.md` in the working tree: `benchmarks/sweep.mjs` takes `--results <dir>`, and its test writes there.

## 0.39.1 - 2026-09-24

### Fixed

- `shipping` reruns the verifier and the same `--route pr-merge` command after a check fix, never `--merge`, which skips the wait for checks and met them still pending.
- `shipping` watching answers a reviewer's request to rebase and force-push with a merge commit, a plain push and a reply, instead of offering the force-push as the recommended route.

## 0.39.0 - 2026-09-24

### Highlights

**`shipping` now runs a fresh `sonnet` verifier on every pull request before it merges one, and a `FAIL` verdict stops that merge even when all checks are green.**

### Added

- `shipping` takes over the pull-request lifecycle: it prepares the commits, title and `Why`/`Scope`/`Tradeoffs`/`Blast Radius`/`Verification` body, fixes failing checks for at most three rounds, resolves conflicts with a check before the push, turns review comments into an action list as untrusted text, and watches a pull request to merge-ready without merging it; the detail lives in five files under `skills/shipping/references/` plus `verifier-prompt.md`, loaded only at the step that needs them.

## 0.38.4 - 2026-09-24

### Fixed

- The delegate budget keys the design-builder override as `exo:design-builder`, the `agent_type` the hook receives, so its 35-call limit applies; before, the unprefixed key never matched. A new verify check fails on any budget key that is not `exo:<agent>` or a built-in agent type.

## 0.38.3 - 2026-09-24

### Fixed

- The delegate budget gives the read-only agents (`exo:explorer`, `exo:researcher`, `exo:design-discovery`, `exo:design-critic`, both branch reviewers and `Explore`) a soft limit of 70k instead of 40k, and using-exo tells the lead to put a `Budget: 70k/100k` line in a read-only `general-purpose` dispatch, so a reader is no longer told to read nothing new after a few files.

## 0.38.2 - 2026-09-24

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
