# Contributing

## Setup

Node 20 or newer. There are no dependencies to install.

## Tests

`npm test` runs every `*.test.mjs` file under `tests/`. Add a test next to the
behavior you change.

## Code style

ES modules, semicolons on, no new dependencies without a discussion in
an issue first.

## Commits

- The subject is a Conventional Commit: `type(scope): summary`, with `type` one of
  `feat`, `fix`, `refactor`, `docs`, `test`, `chore`, `perf`, `build` or `ci`.
  The scope is optional, the summary is lowercase and has no trailing period.
- The message never carries AI attribution: no `Co-Authored-By` trailer for an
  assistant, no "Generated with" line, no robot emoji. The log records who is
  accountable for a change, and that is the person who commits it.
- One logical change per commit; the body says why when the subject cannot.

## Pull requests

Link the issue, list the commands you ran, and keep the diff to one concern.
