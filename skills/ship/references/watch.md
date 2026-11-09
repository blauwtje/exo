# Watching a pull request

Goal: carry one pull request to merge-ready in rounds, then hand it back.

## The round

- Run one watcher per pull request at a time, because two rounds on one branch push over each other.
- A delegate that opened the pull request does not watch it and hands back to the dispatching session.
- Before triaging, fetch full state: `gh pr view <number> --json number,title,state,mergeable,reviewDecision,statusCheckRollup,mergeStateStatus,comments,reviews`.
- Push a round's known fixes together as one wave. When a conflict blocks, do not work a check to look busy.
- While a check runs, pace the recheck with `gh pr checks --watch` only in the dispatching session; a delegate runs no `--watch`. With nothing left to wait on, hand back and do not poll.

## The triage order

Work in this order:

- Merge conflicts first: resolve and push a merge commit.
- When a reviewer asks to rebase and force-push, still push the merge commit without asking, and reply that a squash merge lands it as one linear commit.
- Failing checks second.
- Review comments third.
- Bot and automation comments fourth.

## The stop conditions

- At the round limit short of green, stop, summarize what remains and hand back.
- Call it ready when the build is green, every comment is resolved and the branch merges cleanly.
- The draft stays a draft until then, because marking it ready earlier misrepresents its state.
- When the next fix needs a design choice, stop and ask the user to make it.
- Answer a user question mid-round and carry on. Only the user's explicit stop ends the watch early.

## Merge-ready is the end

- A watch stops at merge-ready, and only an explicit merge moves to the skill's step 7.
- Rewrite history or retarget a base on a branch others may have pulled only when the user names it first.

## Report

- Name fixes applied as a count and commit range (`<first>..<last>`), a lone SHA only for a fix the user must act on, comments addressed or deferred with a reason.
- Name current status, what is pending, what needs the human.
- Offer any team-useful dismissal pattern from the round's triage as a candidate rubric entry.
