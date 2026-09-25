# Fixing a failing check

Chase the first actionable error to a green check with the smallest fix that closes it. The enemy is a broad refactor or a blind retry that hides whether the fix worked. The overcorrection is grinding past the round limit instead of handing back a check that will not go green.

## Read the failure

- Inspect every failing check with `gh pr checks --json name,bucket,state,workflow,link` or its log before touching code, because a guessed cause fixes the wrong thing.
- Find the first actionable error and work one failure at a time, because later errors often follow from the first.

## Smallest fix

- Apply the smallest safe fix for that one failure, because a small diff shows whether it closed the failure.
- Prefer a minimal, low-risk change over a broader refactor, because a refactor widens what the next check must prove.

## Rerun rules

- Push, rerun `gh pr checks`, and repeat: fix, push, recheck, within the round limit.
- At the round limit, stop, hand back and summarize what is still broken.

## Flake and a stale base

- Report a suspected flake or infrastructure failure as a stop, because a blind retry hides whether anything changed.
- A failure repeated identically across runs was never flake: reclassify it and read the child logs.
- Run `git merge-base --is-ancestor origin/<base branch> HEAD` before calling a failure flake.
- Report a stale base as a stop needing an update from its base branch, because a pushed branch is never rebased here.
- Only a failure inside the diff's own code gets a commit.

## Report

- Name the primary failing job and its root error, the fixes applied in order, and the current CI status and next action.

## Judgment

- The round limit outranks one more likely fix: hand back rather than grind.
- A stale base outranks a flake verdict: check ancestry before reporting a flake.
