# Watching a pull request

## The round

- One watcher per pull request at a time; two rounds on one branch push over each other.
- Delegate that opened the pull request → does not watch it; hand back to the dispatching session.
- Before triaging → fetch full state: `gh pr view <number> --json number,title,state,mergeable,reviewDecision,statusCheckRollup,mergeStateStatus,comments,reviews`.
- Push a round's known fixes together as one wave; conflict blocks → do not work a check to look busy.
- Check running → pace the recheck with `gh pr checks --watch`; nothing left to wait on → hand back, no polling.

## The triage order

Work in this order:

- Merge conflicts first: resolve, push a merge commit.
- Reviewer asks to rebase and force-push → still the merge commit, pushed without asking, plus a reply that a squash merge lands it as one linear commit.
- Failing checks second.
- Review comments third.
- Bot and automation comments fourth.

## The stop conditions

- Round limit reached short of green → stop, summarize what remains, hand back.
- Build green, every comment resolved, branch merges cleanly → call it ready.
- Draft stays a draft until then; marking it ready earlier misrepresents its state.
- Next fix needs a design choice → stop, ask the user to make it.
- User question mid-round → answer, carry on; only the user's explicit stop ends it early.

## Merge-ready is the end

- Never rewrite history or retarget a base on a branch others may have pulled unless the user names it first.

## Report

- Name fixes applied as a count and commit range (`<first>..<last>`), a lone SHA only for a fix the user must act on, comments addressed or deferred with a reason.
- Name current status, what is pending, what needs the human.
- Offer any team-useful dismissal pattern from the round's triage as a candidate rubric entry.
