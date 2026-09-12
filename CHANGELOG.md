# Changelog

Versions follow [Semantic Versioning](https://semver.org/spec/v2.0.0.html). A
skill's trigger, a skill or agent name, and the `exo:` namespace are the public
surface: renaming or removing one is a breaking change, adding one is a minor
release, and a body rewrite that keeps the trigger is a patch.

## Unreleased

## 0.3.9 - 2026-09-12

### Fixed

- `capture.mjs` waits for the screenshot browser to exit before it removes the
  browser profile, and retries that removal, so a capture no longer fails with
  `ENOTEMPTY` on CI.
- A savings ledger that cannot be read or parsed is left untouched: the hook
  reports the error instead of rewriting the ledger with the current session
  alone.
- The ledger lock waits up to 8 seconds and counts a lock as stale only after
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

- The ledger no longer writes a session's cost, duration, token or line totals,
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
  alone. `OVERHEAD_VERSION` rises to 3, so every ledger row is re-read from its
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
  ledger, and the right-sizing column in `benchmarks/score.mjs`.
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
