# Fixing a failing check

## Read the failure

- Before touching code → inspect every failing check with `gh pr checks --json name,bucket,state,workflow,link` or its log; a guessed cause fixes the wrong thing.

## Rerun rules

- Round limit reached → stop, hand back, summarize what is still broken.

## Flake and a stale base

- Commit only for a failure inside the diff's own code.
- Before calling a failure flake → run `git merge-base --is-ancestor origin/<base branch> HEAD`.
- Suspected flake or infrastructure failure → report as a stop, no blind retry.
- Failure repeated identically across runs → not flake; reclassify, read the child logs.
- Stale base → report as a stop needing an update from its base branch; a pushed branch is never rebased here.

## Report

- Name the primary failing job and its root error, fixes applied as a count and commit range (`<first>..<last>`), a lone SHA only for a fix the user must act on, current CI status, next action.
