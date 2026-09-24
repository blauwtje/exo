# Babysitting a pull request

Round a pull request to merge-ready by clearing its blockers in order, one push wave at a time, and stop at merge-ready rather than merging it. The enemy is fixing whatever is easiest instead of the actual blocker. The overcorrection is a loop that never stops or that merges on its own authority.

## The round

- Fetch the pull request's full state before triaging: `gh pr view <number> --json number,title,state,mergeable,reviewDecision,statusCheckRollup,mergeStateStatus,comments,reviews`.
- Confirm the pull request read matches the one the request meant.
- Run one babysitter per pull request at a time; check nothing else is already working it.
- A subagent that opened the pull request does not babysit it; hand back to the parent.
- Batch every known fix into one push wave per round; do not fix a check just to look busy when a conflict is the real blocker.
- Pace the recheck: poll `gh pr checks --watch` while a check runs; a 20 to 30 minute heartbeat while awaiting a reviewer; hourly if idle but watching for new comments.

## The triage order

- Merge conflicts first: resolve them; force-push only when the branch is yours and unshared.
- Failing checks second: root-cause the failure, fix the code or the test, commit, push.
- Review comments third: act on feedback you agree with, leave a reply on a judgement call.
- Bot and automation comments fourth: classify fix, dismiss or ask before acting.

## The stop conditions

- The build is green, every comment is resolved and the branch merges cleanly: call it ready.
- Three rounds of fix, push, recheck still leave it short of green: stop, summarize what remains, hand back.
- The next fix would force a design choice: pause and put it to the user.
- Answer a user question mid-round and continue; only an explicit stop ends the round early.

## The no-merge rule

- The round never merges the pull request; it stops at merge-ready.
- Only an explicit user request to merge, land, ship or merge when ready authorizes a merge.
- Never rewrite history or retarget a base on a branch others may have pulled without the user naming it first.

## Report

- Name the fixes applied, the comments addressed and deferred with reason, the current status, each commit by its SHA, what is pending and what needs the human.
