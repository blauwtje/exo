# Resolving merge conflicts

Resolve a DIRTY pull request with the smallest edit that keeps both sides' intent, then prove it before it reaches the remote. The enemy is a conflict settled by picking a side unread. The overcorrection is a cleanup pass that reaches beyond the conflicted lines.

## Find every conflict

- List every conflicting file from `git status` plus its in-file conflict markers before resolving anything.

## Resolve

- Resolve each conflict with a minimal, correctness-first edit.
- Keep both sides when safe; otherwise keep the variant that compiles and preserves public behavior.
- Leave no conflict markers in any file, and make no broad refactor while resolving.

## Lockfiles

- Regenerate a conflicted lockfile with the package manager's own tooling; never hand-edit it.

## Validate before the push

- Stage the resolved files and summarize the key resolution decisions.
- Run the project's own check, compile, lint and the relevant tests, before the push that follows.
- A failing check here blocks the push; fix it or report it, never push past it.

## Report

- Name the files resolved, the notable resolution choices and the build and test outcome.

## Judgment

- A failing check after the resolve outranks the push: fix or report it, never push past it.
- Correctness outranks keeping both sides: keep the variant that compiles and preserves public behavior.
