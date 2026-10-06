# Fixing a failing check

## Read the failure

- Inspect every failing check with `gh pr checks --json name,bucket,state,workflow,link` or its log before touching code, because a guessed cause fixes the wrong thing.
- Find the first actionable error and work one failure at a time, because later errors often follow from the first.

## Smallest fix

- Apply the smallest safe fix for that one failure, because a small diff shows whether it closed the failure.

## Rerun rules

- Push, rerun `gh pr checks`, and repeat: fix, push, recheck, within the round limit.
- At the round limit, stop, hand back and summarize what is still broken.

## Flake and a stale base

- Only a failure inside the diff's own code gets a commit.
- Run `git merge-base --is-ancestor origin/<base branch> HEAD` before calling a failure flake.
- Report a suspected flake or infrastructure failure as a stop, because a blind retry hides whether anything changed.
- A failure repeated identically across runs was never flake: reclassify it and read the child logs.
- Report a stale base as a stop needing an update from its base branch, because a pushed branch is never rebased here.

## Report

- Name the primary failing job and its root error, the fixes applied as a count and a commit range (`<first>..<last>`), a lone SHA only for a fix the user must act on, and the current CI status and next action.
