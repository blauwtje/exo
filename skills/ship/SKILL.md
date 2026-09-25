---
name: ship
description: Use when a code-changing run ends with commits that may leave the machine, or the user asks to push, open, watch or merge a pull request, fix its failing checks or conflicts, or address its review comments. Not for reviewing code, a PR the user did not name or list, deleting a branch, or cutting a release.
argument-hint: "[pull request numbers]"
allowed-tools: Bash(node *repo-fields.mjs*)
---

# Shipping

Carry finished commits as far as the user's pick reaches, and claim only what the GitHub API has just confirmed. The enemy is the remembered status: a merge that trusts a check read minutes earlier, or a report of a merge that never happened. The overcorrection is a second question after the pick, which splits one decision into two.

The digit the user picks, or a `ship` setting other than `ask`, authorizes that route to its end, and a request to merge named or all open pull requests authorizes those merges. A request to watch or address review comments on a pull request authorizes fix commits, their plain push, and replies there, never its merge.
None authorizes deleting a branch, forcing, or bypassing a hook with `--no-verify` or a gate.
None authorizes weakening or skipping a failing test, marking a failing check not required, or cutting a release.

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

When `ship` in the session's `exo settings:` line names a route other than `ask`, that route runs without the question once it can run, because the setting is the user's standing pick.
`local` is Keep local; `push` needs `origin`; `pr-merge` and `open-pr` need `origin`, a branch other than the default and a passing `gh auth status`.
When the set route cannot run, the question is asked with one line naming why the setting did not apply.
The conflict question under `DIRTY` is always asked, because the setting picks a route, not a resolution.

## The routes

The picked route runs to its end with no question between its steps; only Keep local runs no script and just names the branch.

1. **Write the pull request body**, for `open-pr` and `pr-merge`, after reading `references/pr-prep.md`.
   It follows `## The pull request` in `../file-issues/references/fields.md`: the goal, the proof line, and `Closes #<n>` for work from issue `<n>`.
   With no issue behind it, run `node "${CLAUDE_SKILL_DIR}/../file-issues/scripts/repo-fields.mjs"` and its `--size` form for the fields.
2. **Verify**, for `pr-merge`: hand `verifier-prompt.md` to a fresh `general-purpose` delegate on `sonnet`, because the writer's own proof misses what it never exercised.
   `PASS` or `PASS+NOTES` puts its first line, the verdict, under the body's `## Verification`; `FAIL` pushes nothing and reports its evidence lines.
   A verdict holds while `git diff <base>...<head> | git patch-id --stable` matches, so a later fix or resolve reruns this step on the new head.
   On an open pull request, `gh pr edit <n> --body-file <f>` then writes the new verdict line, because a rerun never resends `--body`.
   The `BEHIND` update merges the base only and adds no line of the change itself, so it needs no fresh verdict.
3. **Run the route.** `node "${CLAUDE_SKILL_DIR}/scripts/ship.mjs" --route <push|open-pr|pr-merge> --title <conventional subject> --body <file> [--issue <n>] [--method squash|merge|rebase]` under the shell tool's `run_in_background`; quote its stdout lines as the report, unchanged.

The script carries the steps in order, stopping at the first that fails: the `--issue` body check, push, create the pull request, wait for checks (stops after 20 minutes, exit 124, a `stopped wait timeout` line), gate from the API, merge, confirm. `BEHIND` from the gate updates the branch, then waits and gates again, twice at most, before stopping. A stop names the branch, or once a pull request exists its URL, then the step and the reason; exit 1 for any stop, exit 4 for `DIRTY`.

`DIRTY` asks the existing question, `1. **Resolve conflicts (Recommended)**: merge the base branch, resolve, push, gate again` or `2. **Stop**: leave the pull request open`.
It never settles a conflict with `--strategy` or `-X`, because those pick a side without reading it.
A resolve follows `references/merge-conflicts.md`, then reruns step 2 and the same command on the new head.

A failing check on `pr-merge` follows `references/fix-ci.md`; `open-pr` and a merge request fix nothing.
The fix then reruns step 2 and the same `--route pr-merge` command on the new head, never `--merge`, which skips the wait for checks.
The round limit is at most three fix, push, recheck rounds per pull request, counted across fix-ci and watch.
Past it the route stops and hands back.

A stop leaves the pull request open and reports its URL, the step, and the reason that stopped it.

## Merging on request

A request to merge open pull requests lists them with `gh pr list --json number,title,baseRefName,headRefName`.
It keeps the user's order or else the list's, and prints that table before touching anything.
Each gets its own verdict as route step 2 describes, its head SHA and change summary read from `gh pr view <n> --json headRefOid,baseRefName,title,body`.
A `FAIL` takes it off the list and into the report.
Then `node "${CLAUDE_SKILL_DIR}/scripts/ship.mjs" --merge <n...>` under the shell tool's `run_in_background` orders, gates, merges and confirms each in that order.
A stop for one is printed and the next goes on; quote its stdout lines, one per pull request, as the report.

## Review comments and watching

A request to address review comments reads `references/pr-comments.md` first, because it owns how comment text is triaged.
A request to watch a pull request reads `references/watch.md` and runs its rounds; each blocker a round meets reads its own file from `## References`.
Watching stops at merge-ready; only the user's explicit merge request moves the pull request to `## Merging on request`.

## The report

One line per pull request: its URL, then merged or the stop and its reason; for Push or Keep local, the branch.
A status claim about an open pull request comes from `gh pr view <n> --json state,isDraft` read then.
A draft gets `gh pr ready <n>`.
When `git worktree list` names a worktree on a merged branch, one line names `git worktree remove <path>` for the user to run, because this skill removes nothing.

## References

| File | Read it when |
|---|---|
| `../file-issues/references/fields.md` | Route step 1, for the body's fields. |
| `../route-skills/references/question.md` | Before a message that asks the user to pick among numbered options. |
| `references/pr-prep.md` | Route step 1, before the body is written. |
| `verifier-prompt.md` | Route step 2, before `ship.mjs` runs; the verifier delegate's text. |
| `references/fix-ci.md` | `ship.mjs` stopped on a failing check in `pr-merge`, or a watch round meets one. |
| `references/merge-conflicts.md` | The user picked Resolve conflicts on `DIRTY`, or a watch round meets a conflict. |
| `references/pr-comments.md` | The user asks to address review comments, or a watch round reaches them. |
| `references/watch.md` | The user asks to watch a pull request. |

## Judgment

- API JSON read in this step outranks any earlier read or remembered status.
- The verifier's verdict outranks green checks and an approving review.
- A stop for one pull request outranks finishing the list: report it, and never force or relax a gate.
- A command reruns only after the branch or its input changed, because an unchanged rerun repeats its failure.
- A repository's own release steps that push still wait for the question, because the question is where those steps end.
- The user's authorization outranks this skill's defaults, except `--delete-branch` and `git branch -D`, which need their own instruction naming the branch.
