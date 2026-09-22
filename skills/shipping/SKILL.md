---
name: shipping
description: Use when a code-changing run ends with commits that may leave the machine, or the user asks to push, open a pull request, or merge open or listed PRs. Not for reviewing code, a PR the user did not name or list, deleting a branch, or cutting a release.
argument-hint: "[pull request numbers]"
---

# Shipping

Carry finished commits as far as the user's pick reaches, and claim only what the GitHub API has just confirmed. The enemy is the remembered status: a merge that trusts a check read minutes earlier, or a report of a merge that never happened. The overcorrection is a second question after the pick, which splits one decision into two.

The digit the user picks authorizes that route to its end, and a request to merge named or all open pull requests authorizes those merges. Neither authorizes deleting a branch, forcing or bypassing a gate, or cutting a release.

## When to use

- `implementing`, `implementing-batch` or `debug` has committed a change and ends its turn here.
- The user asks to push, to open a pull request, or to merge open or listed pull requests.
- Not for reviewing code, a pull request the user did not name or list, deleting a branch, or a release, which the repository's own workflow cuts.

## The overview

One message, in the conversation's language, the question directly under it:

```text
<outcome in one line>

Changed
- <what>: <why, in one clause>
Verified
- `<command>`: <result>
Branch
- <branch or worktree path>, <n> commits, not pushed
```

- `Changed` holds at most five lines; three or more files of one kind become one line with a count.
- A check that did not run is a `Verified` line saying so.
- No table, no recap of the plan, and no list of work not done.

## The question

In the shape `## A question` in `using-exo` gives, offering only routes that can run, and nothing leaves the machine before the digit arrives. Without a remote named `origin` nothing can, and the overview ends the turn with no question.

On any branch but the default, or in a worktree:

```text
1. **PR + merge (Recommended)**: push, open a pull request, merge it once checks pass
2. **Open PR**: push and open a pull request, leave it open
3. **Push**: push the branch, no pull request
4. **Keep local**: nothing leaves this machine
```

On the default branch:

```text
1. **Push (Recommended)**: push the commits to origin
2. **Keep local**: nothing leaves this machine
```

When `gh auth status` fails, both pull-request routes are left out and `1. **Push (Recommended)**` leads.

## The routes

The picked route runs its steps in order with no question between them, and stops at the first that fails.

1. **Push.** `git push -u origin <branch>` on a branch, `git push --follow-tags` on the default branch. Push ends here; Keep local runs nothing and names the branch.
2. **Open the pull request** as `## The pull request` in `../issuing/references/fields.md` says: the body carries the goal, the proof line and `Closes #<n>` when the work came from issue `<n>`. Open PR ends here with its URL.
3. **Wait for the checks, bounded.** Run `node "${CLAUDE_SKILL_DIR}/scripts/wait-checks.mjs" --pr <n>` with the shell tool's `run_in_background` and continue when it exits: it watches `gh pr checks` and stops after 20 minutes, so a stuck CI never holds the session. Exit 0 goes on; exit 1, a red check, and exit 124, a timeout, stop here.
4. **Gate from the API.** Right before the merge, run `gh pr view <n> --json number,title,mergeable,mergeStateStatus,statusCheckRollup,baseRefName,headRefName,reviewDecision --jq '{number,title,mergeable,mergeStateStatus,reviewDecision,baseRefName,headRefName,checks:[.statusCheckRollup[]|{name,context,conclusion,state}]}'` and print it. Merge only when `mergeStateStatus` is `CLEAN` and every check has `conclusion` or `state` `SUCCESS`; `BLOCKED`, `BEHIND`, `DIRTY`, `UNSTABLE`, `UNKNOWN`, a pending check or a `CHANGES_REQUESTED` review stops here. Never read a status from memory or an earlier step.
5. **Merge bases first.** A pull request is a base when another open one's `baseRefName` equals its `headRefName`: merge it before the ones stacked on it and say which this applies to, because GitHub closes a stacked pull request whose base branch disappears.
6. **Merge one.** `gh pr merge <n> --squash`, or the method the repository documents, never with `--delete-branch`, `--admin` or `--auto`.
7. **Confirm.** `gh pr view <n> --json state,mergedAt` must show `state` `MERGED` before the report says merged; otherwise report it not merged with that JSON. A stacked pull request then needs a fresh gate, because its base just moved.

A stop leaves the pull request open and reports its URL, the step, and the check name or JSON field that stopped it. It never forces, relaxes a gate, or retries a command unchanged.

## Merging on request

A request to merge open pull requests lists them with `gh pr list --json number,title,baseRefName,headRefName`, keeps the user's order or else the list's, and prints that table before touching anything. Each pull request then runs route steps 4 to 7, one at a time; a stop for one is reported and the next goes on.

## The report

One line per pull request: its URL, then merged or the stop and its reason; for Push or Keep local, the branch. When `git worktree list` names a worktree on a merged branch, one line names `git worktree remove <path>` for the user to run, because this skill removes nothing.

## References

| File | Read it when |
|---|---|
| `../issuing/references/fields.md` | Route step 2, before creating the pull request, for its body and fields. |

## Judgment

- API JSON read in this step outranks any earlier read or remembered status.
- A stop for one pull request outranks finishing the list: report it, never force, never relax a gate.
- A repository's own release steps that push still wait for the question, because the question is where those steps end.
- The user's authorization outranks this skill's defaults, except `--delete-branch` and `git branch -D`, which need their own instruction naming the branch.
- A worktree stays after any route: removing it is the user's step once the pull request merges.
