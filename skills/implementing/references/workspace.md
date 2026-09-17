# Workspace

Ask where a code-changing run commits before its first edit, and commit only where the answer puts it. The enemy is the silent choice: a run that picks the default branch, a branch or a worktree for the user and then pushes what it committed. The overcorrection is asking again inside a run that already sits where the user chose.

## When it is asked

1. **Outside git, never.** When `git rev-parse --show-toplevel` fails, nothing is committed and the report says so in one line.
2. **In a chosen place, never.** Inside a linked worktree, where `git rev-parse --git-dir` and `git rev-parse --git-common-dir` differ, or on a branch other than the default one, the run commits there and the report names it, because asking would offer a branch off a branch.
3. **Otherwise first.** The question is the run's first message, before any edit or dispatch, in the shape `## A question` in `using-exo` gives, and the run stops until the digit arrives:

```text
1. **Branch (Recommended)**: a new branch here
2. **Worktree**: a separate folder, checkout untouched
3. **Current branch**: commit onto <default branch>
```

The default branch is the one `git symbolic-ref --short refs/remotes/origin/HEAD` names after `origin/`; without that ref it is the current branch. When the root `CLAUDE.md` or `AGENTS.md` states that work is committed on the default branch, the current branch becomes `1. **Current branch (Recommended)**`, followed by `2. **Branch**` and `3. **Worktree**`, because that rule is the repository's own answer; the question is still asked.

## Carrying out the pick

- **Branch.** `git switch -c <type>/<slug>`, named by the plan's `Branch:` line when it names a branch other than the default, otherwise from the goal.
- **Worktree.** The harness's worktree tool when one is available; otherwise `git worktree add ../<repository>-<slug> -b <type>/<slug>`, a sibling folder outside the repository so nothing inside it is tracked, and every later command runs there.
- **Current branch.** Stay; commits land on it.

Every landed unit then commits in Conventional Commits where the pick put it. Nothing is pushed: a push waits for the question in `finishing.md`.

## Judgment

- An explicit instruction in the request, such as a branch name, "work on main" or "use a worktree", is the answer, so the question is not asked.
- A run another stage started holds its caller's answer; it asks nothing, and the caller finishes.
- A failed `git switch` or `git worktree add` is reported with its output and the run stops before any edit, because an edit on the wrong branch is the failure this step prevents.
