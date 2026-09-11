# Changelog

Versions follow [Semantic Versioning](https://semver.org/spec/v2.0.0.html). A
skill's trigger, a skill or agent name, and the `exo:` namespace are the public
surface: renaming or removing one is a breaking change, adding one is a minor
release, and a body rewrite that keeps the trigger is a patch.

## Unreleased

### Added

- `implementing` scopes a reviewer's second round to its own findings and the
  fix diff through `re-review-prompt.md`.
- The savings ledger records each session's project, and `savings` prices a
  session's tokens at API list prices per model (`prices.mjs`) when the status
  line reports no cost.

### Changed

- Every savings figure (cost, lines, tokens, time; panel, status line and
  trend) is net of all of exo's overhead, from exo's own benchmark ratios with
  their standard error. The read guard times itself and books its refusals by
  tool call; the status line drops its separate guard figure.
- `savings report` prints a card: the switch state and what each state does,
  the saving in the current project beside all projects, and a 30-day trend.

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

### Removed

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
