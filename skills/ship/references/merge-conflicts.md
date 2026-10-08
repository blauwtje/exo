# Resolving merge conflicts

## Find every conflict

- List every conflicting file from `git status` plus its in-file conflict markers before resolving anything, because a missed file ships a marker.

## Resolve

- A resolve never uses `--strategy`/`-X`.
- Create no tag while resolving, because a tag can cut a release, which nothing here authorizes.

## Lockfiles

- Regenerate a conflicted lockfile with the package manager's own tooling, because a hand-edited lockfile drifts from what the tool resolves.

## Validate before the push

- A failing check here blocks the push; fix it or report it, never push past it.
- Run the project's own check, compile, lint and the relevant tests, before the push that follows.

## Report

- Name the files resolved, the notable resolution choices and the build and test outcome.
