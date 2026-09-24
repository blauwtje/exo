---
name: shipping
description: Use when a code-changing run ends with commits that may leave the machine, or the user asks to push, open a pull request, or merge open or listed PRs. Not for reviewing code, a PR the user did not name or list, deleting a branch, or cutting a release.
argument-hint: "[pull request numbers]"
---

# Shipping

Carry finished commits as far as the user's pick reaches, and claim only what the GitHub API has just confirmed. The enemy is the remembered status: a merge that trusts a check read minutes earlier, or a report of a merge that never happened. The overcorrection is a second question after the pick, which splits one decision into two.

The digit the user picks authorizes that route to its end, and a request to merge named or all open pull requests authorizes those merges. Neither authorizes deleting a branch, forcing or bypassing a gate, or cutting a release.

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
- No table, no recap of the plan, no list of work not done.

## The question

In the question shape, offering only routes that can run; nothing leaves the machine before the digit arrives. Without a remote named `origin` nothing can, and the overview ends the turn with no question.

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
3. **Wait for the checks, bounded.** Run `node "${CLAUDE_SKILL_DIR}/scripts/wait-checks.mjs" --pr <n>` under the shell tool's `run_in_background` and continue when it exits; it stops after 20 minutes, so a stuck CI never holds the session. Exit 0 goes on; exit 1, a red check, and exit 124, a timeout, stop here. Exit 3 is a gh failure, not a red check, and stops here with the printed `checks: error` line read before a retry.
4. **Gate from the API.** Right before the merge, run `node "${CLAUDE_SKILL_DIR}/scripts/ship-gate.mjs" --pr <n>` and quote its one line. `MERGE` goes on; a `SKIPPED` or `NEUTRAL` check passes, because it ran by its own rules. `STOP <field>=<value> [check]` stops here, and so does exit 3, a gh failure. `BEHIND` runs `gh pr update-branch <n>`, then step 3 and this gate again, because the checks ran on the old base. `DIRTY` asks one question, `1. **Resolve conflicts (Recommended)**: merge the base branch, resolve, push, gate again` or `2. **Stop**: leave the pull request open`, and never settles a conflict with `--strategy` or `-X`, because those pick a side without reading it.
5. **Merge bases first.** With two or more pull requests, run `node "${CLAUDE_SKILL_DIR}/scripts/ship-gate.mjs" --order <n...>` and merge in the printed order, saying so, because GitHub closes a stacked pull request whose base branch disappears. `CYCLE` stops here and names the pull requests.
6. **Merge one.** `gh pr merge <n> --squash`, or the method the repository documents, never with `--delete-branch`, `--admin` or `--auto`.
7. **Confirm.** `gh pr view <n> --json state,mergedAt` must show `state` `MERGED` before the report says merged; otherwise report it not merged with that JSON. A stacked pull request then needs a fresh gate, because its base just moved.

A stop leaves the pull request open and reports its URL, the step, and the check name or JSON field that stopped it.

## Merging on request

A request to merge open pull requests lists them with `gh pr list --json number,title,baseRefName,headRefName`, keeps the user's order or else the list's, and prints that table before touching anything. Each then runs route steps 4 to 7, one at a time; a stop for one is reported and the next goes on.

## The report

One line per pull request: its URL, then merged or the stop and its reason; for Push or Keep local, the branch. When `git worktree list` names a worktree on a merged branch, one line names `git worktree remove <path>` for the user to run, because this skill removes nothing.

## References

| File | Read it when |
|---|---|
| `../issuing/references/fields.md` | Route step 2, before creating the pull request, for its body and fields. |
| `../using-exo/references/question.md` | Before a message that asks the user to pick among numbered options. |

## Judgment

- API JSON read in this step outranks any earlier read or remembered status.
- A stop for one pull request outranks finishing the list: report it, and never force, relax a gate, or retry a command unchanged.
- A repository's own release steps that push still wait for the question, because the question is where those steps end.
- The user's authorization outranks this skill's defaults, except `--delete-branch` and `git branch -D`, which need their own instruction naming the branch.
