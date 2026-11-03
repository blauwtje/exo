# Fixing a failing check

Goal: fix the failing check at its real cause within three rounds, or hand back with the state clear.

## Read the failure

- Before touching code, inspect every failing check with `gh pr checks --json name,bucket,state,workflow,link` or its log. A guessed cause fixes the wrong thing.

## Rerun rules

- `open-pr` or a merge request stops after three fix rounds, watch included.
- At the round limit, stop, hand back and summarize what is still broken.

## Flake and a stale base

- Commit only for a failure inside the diff's own code.
- Before calling a failure flake, run `git merge-base --is-ancestor origin/<base branch> HEAD`.
- A suspected flake or infrastructure failure is a reported stop, with no blind retry.
- A failure that repeats identically across runs is not flake: reclassify it and read the child logs.
- A stale base is a reported stop that needs an update from its base branch. A pushed branch is not rebased here.

## Report

- Name the primary failing job and its root error, the fixes applied as a count and commit range (`<first>..<last>`), a lone SHA only for a fix the user must act on, the current CI status and the next action.
