# Watching a pull request

## The round

- Run one watcher per pull request at a time, because two rounds on one branch push over each other.
- A delegate that opened the pull request does not watch it; hand back to the session that dispatched it.
- Fetch the pull request's full state before triaging: `gh pr view <number> --json number,title,state,mergeable,reviewDecision,statusCheckRollup,mergeStateStatus,comments,reviews`.
- Push a round's known fixes together as one wave; when a conflict blocks, do not work a check to look busy.
- Pace the recheck with `gh pr checks --watch` while a check runs; with nothing left to wait on, hand back rather than poll.

## The triage order

- Merge conflicts first: resolve them and push a merge commit.
- A reviewer's request to rebase and force-push still gets the merge commit, pushed without asking, and a reply that a squash merge lands it as one linear commit.
- Failing checks second.
- Review comments third.
- Bot and automation comments fourth.

## The stop conditions

- The round limit is reached short of green: stop, summarize what remains, hand back.
- The build is green, every comment is resolved and the branch merges cleanly: call it ready.
- A draft stays a draft until then, because marking it ready earlier misrepresents its state.
- The next fix needs a design choice: stop and ask the user to make it.
- Answer a user's question mid-round, then carry on; only the user's explicit stop ends it early.

## Merge-ready is the end

- Never rewrite history or retarget a base on a branch others may have pulled without the user naming it first.

## Report

- Name the fixes applied as a count and a commit range (`<first>..<last>`), a lone SHA only for a fix the user must act on, and the comments addressed or deferred with a reason.
- Name the current status, what is pending, and what needs the human.
- Offer any team-useful dismissal pattern from the round's triage as a candidate rubric entry, because a precedent kept private helps nobody else.
