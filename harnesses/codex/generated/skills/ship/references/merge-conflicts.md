# Resolving merge conflicts

## Find every conflict

- Before resolving → list every conflicting file from `git status` plus its in-file conflict markers; a missed file ships a marker.

## Resolve

- No `--strategy`/`-X`.
- No tag while resolving; a tag can cut a release, which nothing here authorizes.

## Lockfiles

- Conflicted lockfile → regenerate with the package manager's own tooling, never hand-edit.

## Validate before the push

- Failing check here blocks the push → fix it or report it, never push past it.
- Before the push → run the project's own check, compile, lint and relevant tests.

## Report

- Name the files resolved, notable resolution choices, build and test outcome.
