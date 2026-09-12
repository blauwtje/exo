# Changelog

Versions follow [Semantic Versioning](https://semver.org/spec/v2.0.0.html). A
skill's trigger, a skill or agent name, and the `exo:` namespace are the public
surface: renaming or removing one is a breaking change, adding one is a minor
release, and a body rewrite that keeps the trigger is a patch.

## Unreleased

### Added

- `implementing` scopes a reviewer's second round to its own findings and the
  fix diff through `re-review-prompt.md`.
- `savings` prices a session's tokens at API list prices per model
  (`prices.mjs`) when the status line reports no cost.

### Changed

- Every savings figure (cost, tokens and time, in the panel and the status
  line) is net of all of exo's overhead, from exo's own benchmark ratios with
  their standard error. The read guard times itself and books its refusals by
  tool call; the status line drops its separate guard figure.
- `savings report` draws a fixed-width grid inside a code fence, relayed
  fenced: the switch state, then every session in the ledger at once whatever
  project it ran in, and per metric what those sessions spent with exo, what
  the benchmark says the same work would have cost without it, and the
  difference. One line under the grid names what exo itself cost inside the
  with-exo column, the overhead that makes the saving a net figure; the ledger
  no longer records a session's project.
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
