# Finishing

Close a code-changing run on what changed and where it may go, and move nothing off the machine before the user picks. The enemy is the automatic push: a run that pushes or opens a pull request because the work looked done. The overcorrection is a report so long that the question under it goes unread.

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

In the shape `## A question` in `using-exo` gives, offering only what can run. Without a remote named `origin` nothing can, and the overview ends the turn with no question.

On any branch but the default, or in a worktree:

```text
1. **Open PR (Recommended)**: push and open a pull request
2. **Push**: push the branch, no pull request
3. **Keep local**: nothing leaves this machine
```

On the default branch:

```text
1. **Push (Recommended)**: push the commits to origin
2. **Keep local**: nothing leaves this machine
```

When `gh auth status` fails, `Open PR` is left out and `1. **Push (Recommended)**` leads.

## Carrying out the pick

- **Open PR.** `git push -u origin <branch>`, then create the pull request as `## The pull request` in `../../issuing/references/fields.md` says: the body carries the goal, the proof line and `Closes #<n>` when the work came from issue `<n>`, and the labels, milestone and project fields are copied from that issue rather than derived a second time. Without an issue behind it, that file derives them from what the pull request changes. The report names `/exo:merge-prs <pr>` next, because a merge is that command's gate.
- **Push.** `git push -u origin <branch>` on a branch, `git push --follow-tags` on the default branch.
- **Keep local.** Nothing runs; the report names the branch.

## Judgment

- A repository's own release steps that push still wait for this question, because the question is where those steps end.
- A failed push or pull-request command is reported with its output and never retried unchanged.
- A worktree stays after any pick: removing it is the user's step once the pull request merges.
