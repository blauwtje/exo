# Fixing a failing check

Chase the first actionable error to a green check with the smallest fix that closes it. The enemy is a broad refactor or a blind retry that hides whether the fix worked. The overcorrection is grinding past the round limit instead of handing back a check that will not go green.

## Read the failure

- Inspect every failing check with `gh pr checks --json name,bucket,state,workflow,link`, or its Actions log or check link, before touching code.
- Find the first actionable error; work one failure at a time.

## Smallest fix

- Apply the smallest safe fix for that one failure.
- Prefer a minimal, low-risk change over a broader refactor.

## Rerun rules

- Push, rerun `gh pr checks`, and repeat: fix, push, recheck.
- Stop after three rounds of fix, push, recheck; hand back and summarize what is still broken.

## Flake and a stale base

- Give a flaky or infrastructure failure exactly one fresh build, never a job retry.
- An identical second failure was never flake: reclassify it and read the child logs.
- Run `git merge-base --is-ancestor` before assuming flake; a stale base needs a rebase, not a retry.
- Only a failure inside the diff's own code gets a commit.

## Report

- Name the primary failing job and its root error, the fixes applied in order, and the current CI status and next action.

## Judgment

- The three-round limit outranks one more likely fix: hand back rather than grind.
- A stale base outranks a flake verdict: check ancestry before any fresh build.
