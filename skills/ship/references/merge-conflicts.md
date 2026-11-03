# Resolving merge conflicts

Goal: resolve every conflict with a passing check, without a tag or a strategy flag.

## Stop

- `DIRTY` exits 4 and other stops exit 1, asking `(A) Resolve conflicts` or `(B) Stop` and leaving the pull request open.

## Find every conflict

- Before resolving, list every conflicting file from `git status` plus its in-file conflict markers. A missed file ships a marker.

## Resolve

- Pass no `--strategy` or `-X`.
- Create no tag while resolving. A tag can cut a release, which nothing here authorizes.

## Lockfiles

- Regenerate a conflicted lockfile with the package manager's own tooling. Hand edits drift from what the tool writes.

## Validate before the push

- A failing check here blocks the push: fix it or report it, and do not push past it.
- Before the push, run the project's own check, compile, lint and relevant tests.

## Report

- Name the files resolved, notable resolution choices, build and test outcome.
