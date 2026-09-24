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

The picked route runs to its end with no question between its steps; only Keep local runs no script and just names the branch.

1. **Write the pull request body**, for `open-pr` and `pr-merge`, as `## The pull request` in `../issuing/references/fields.md` says: the goal, the proof line and `Closes #<n>` when the work came from issue `<n>`.
2. **Run the route.** `node "${CLAUDE_SKILL_DIR}/scripts/ship.mjs" --route <push|open-pr|pr-merge> --title <conventional subject> --body <file> [--issue <n>] [--method squash|merge|rebase]` under the shell tool's `run_in_background`; quote its stdout lines as the report, unchanged.

The script carries the steps in order, stopping at the first that fails: the `--issue` body check, push, create the pull request, wait for checks (stops after 20 minutes, exit 124, a `stopped wait timeout` line), gate from the API, merge, confirm. `BEHIND` from the gate updates the branch, then waits and gates again, twice at most, before stopping. A stop names the branch, or once a pull request exists its URL, then the step and the reason; exit 1 for any stop, exit 4 for `DIRTY`.

`DIRTY` asks the existing question, `1. **Resolve conflicts (Recommended)**: merge the base branch, resolve, push, gate again` or `2. **Stop**: leave the pull request open`, and never settles a conflict with `--strategy` or `-X`, because those pick a side without reading it; a resolve pushes and reruns the same command.

A stop leaves the pull request open and reports its URL, the step, and the reason that stopped it.

## Merging on request

A request to merge open pull requests lists them with `gh pr list --json number,title,baseRefName,headRefName`, keeps the user's order or else the list's, and prints that table before touching anything. Then `node "${CLAUDE_SKILL_DIR}/scripts/ship.mjs" --merge <n...>` under the shell tool's `run_in_background` orders, gates, merges and confirms each in that order, a stop for one printed and the next going on; quote its stdout lines, one per pull request, as the report.

## The report

One line per pull request: its URL, then merged or the stop and its reason; for Push or Keep local, the branch. When `git worktree list` names a worktree on a merged branch, one line names `git worktree remove <path>` for the user to run, because this skill removes nothing.

## References

| File | Read it when |
|---|---|
| `../issuing/references/fields.md` | Route step 1, before writing the pull request body, for its fields. |
| `../using-exo/references/question.md` | Before a message that asks the user to pick among numbered options. |

## Judgment

- API JSON read in this step outranks any earlier read or remembered status.
- A stop for one pull request outranks finishing the list: report it, and never force, relax a gate, or retry a command unchanged.
- A repository's own release steps that push still wait for the question, because the question is where those steps end.
- The user's authorization outranks this skill's defaults, except `--delete-branch` and `git branch -D`, which need their own instruction naming the branch.
