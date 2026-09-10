# Changelog

Versions follow [Semantic Versioning](https://semver.org/spec/v2.0.0.html). A
skill's trigger, a skill or agent name, and the `exo:` namespace are the public
surface: renaming or removing one is a breaking change, adding one is a minor
release, and a body rewrite that keeps the trigger is a patch.

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
