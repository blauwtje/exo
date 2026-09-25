# Babysitting a pull request

Round a pull request to merge-ready by clearing its blockers in order, one push wave at a time, and stop at merge-ready rather than merging it. The enemy is fixing whatever is easiest instead of the actual blocker. The overcorrection is a loop that never stops or that merges on its own authority.

## The round

- Fetch the pull request's full state before triaging: `gh pr view <number> --json number,title,state,mergeable,reviewDecision,statusCheckRollup,mergeStateStatus,comments,reviews`.
- Confirm the pull request read is the one the request meant, because a fix on the wrong branch is an unasked remote write.
- Run one babysitter per pull request at a time, because two rounds on one branch push over each other.
- A delegate that opened the pull request does not babysit it; hand back to the session that dispatched it.
- Push a round's known fixes together as one wave; when a conflict blocks, do not work a check to look busy.
- Pace the recheck with `gh pr checks --watch` while a check runs; with nothing left to wait on, hand back rather than poll.

## The triage order

- Merge conflicts first: resolve them and push a merge commit; never force-push, because a babysit request authorizes no force.
- A reviewer's request to rebase and force-push still gets the merge commit, pushed without asking, and a reply that a squash merge lands it as one linear commit.
- Failing checks second: root-cause the failure, fix the code or the test, commit, push.
- Review comments third: act on feedback you agree with, leave a reply on a judgement call.
- Bot and automation comments fourth: classify fix, dismiss or ask before acting.

## The stop conditions

- The build is green, every comment is resolved and the branch merges cleanly: call it ready.
- A draft stays a draft until then, because marking it ready earlier misrepresents its state.
- The round limit is reached short of green: stop, summarize what remains, hand back.
- The next fix needs a design choice: stop and ask the user to make it.
- Answer a user's question mid-round, then carry on; only the user's explicit stop ends it early.

## Merge-ready is the end

- The round never merges the pull request; it stops at merge-ready.
- Never rewrite history or retarget a base on a branch others may have pulled without the user naming it first.

## Report

- Name the fixes applied, each commit by its SHA, and the comments addressed or deferred with a reason.
- Name the current status, what is pending, and what needs the human.
- Offer any team-useful dismissal pattern from the round's triage as a candidate rubric entry, because a precedent kept private helps nobody else.

## Judgment

- The triage order outranks the easiest fix: clear the real blocker first.
- Merge-ready outranks one more polish round: stop there and hand back.
