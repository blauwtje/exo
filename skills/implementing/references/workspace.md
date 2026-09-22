# Workspace

Ask where a code-changing run commits before its first edit, and commit only where the answer puts it. The enemy is the silent choice: a run that picks the default branch, a branch or a worktree for the user and then pushes what it committed. The overcorrection is asking again inside a run that already sits where the user chose.

## When it is asked

1. **Outside git, never.** When `git rev-parse --show-toplevel` fails, nothing is committed and the report says so in one line. A run on a plan whose `Repository:` line names the current folder is the exception: when `ls -A` there lists nothing but `docs`, it runs `git init -b main` and commits on `main` without asking, because a repository with no commit has nothing to branch from; when it lists anything else, the run stops before any edit and names those entries, because an init would capture files the plan never named. A plan whose `Repository:` folder sits inside another repository, where `git rev-parse --show-toplevel` prints a parent folder, stops the same way and names both paths.
2. **In a chosen place, never.** Inside a linked worktree, where `git rev-parse --git-dir` and `git rev-parse --git-common-dir` differ, or on a branch other than the default one, the run commits there and the report names it, because asking would offer a branch off a branch. The exception is a branch whose pull request `gh pr list --head <branch> --state merged --json number` already lists: it counts as the default branch, because a commit there stacks on history `main` holds and conflicts with itself at the next pull request.
3. **Otherwise first.** The question is the run's first message, before any edit or dispatch, in the shape `## A question` in `using-exo` gives, and the run stops until the digit arrives:

```text
1. **Branch (Recommended)**: a new branch here
2. **Worktree**: a separate folder, checkout untouched
3. **Current branch**: commit onto <default branch>
```

The default branch is the one `git symbolic-ref --short refs/remotes/origin/HEAD` names after `origin/`; without that ref it is the current branch. When the root `CLAUDE.md` or `AGENTS.md` states that work is committed on the default branch, the current branch becomes `1. **Current branch (Recommended)**`, followed by `2. **Branch**` and `3. **Worktree**`, because that rule is the repository's own answer; the question is still asked.

## Carrying out the pick

- **Branch.** `git switch -c <type>/<slug>`, from `origin/<default>` after `git fetch origin` when the run sits on a merged branch, named by the plan's `Branch:` line when it names a branch other than the default, otherwise from the goal.
- **Worktree.** The harness's worktree tool when one is available; otherwise `git worktree add ../<repository>-<slug> -b <type>/<slug>`, a sibling folder outside the repository so nothing inside it is tracked, and every later command runs there.
- **Current branch.** Stay; commits land on it.

Every landed unit then commits in Conventional Commits where the pick put it. Nothing is pushed: a push waits for the finish question `shipping` asks.

## Wave worktrees

A wave, as `implementing` step 3 forms it, builds each of its tasks in a worktree of its own, so two delegates never edit one checkout. The run creates, lands and removes them; a delegate never does.

1. **Create.** For each task of the wave run `git worktree add --detach "<root>-task-<n>" HEAD`, where `<root>` is what `git rev-parse --show-toplevel` prints: a sibling folder, detached so no branch is left behind. Then run the plan's `Worktree setup:` command inside it, because a fresh worktree holds no ignored file such as installed dependencies; `Worktree setup: none` runs nothing. A failed `git worktree add` or setup command discards the wave before any dispatch; the current task then builds alone in the run's checkout and the rest of the run forms no wave, so a stale `-task-` folder from an earlier run stops nothing.
2. **Brief.** Each brief names its worktree as the checkout, and as the report directory what `git rev-parse --absolute-git-dir` prints in the run's checkout, because a worktree's own git directory goes when the worktree does.
3. **Land.** With every report green, run each task's `Commit:` block inside its worktree, then on the run branch `git cherry-pick <sha>` for each task in plan order, where `<sha>` is what `git -C "<root>-task-<n>" rev-parse HEAD` prints. A cherry-pick that stops on a conflict is undone with `git cherry-pick --abort`, the worktrees are removed, and the turn ends naming both tasks, because the plan called independent two tasks that edit one region.
4. **Remove.** Run `git worktree remove "<root>-task-<n>"` for each task of the wave. A discarded wave adds `--force`, because its edits were never committed and the plan holds the code that rebuilds them. No turn ends, stops or asks while `git worktree list` still prints a `-task-` path this run made.

## Judgment

- An explicit instruction in the request, such as a branch name, "work on main" or "use a worktree", is the answer, so the question is not asked.
- A run another stage started holds its caller's answer; it asks nothing, and the caller finishes.
- A failed `git switch` or `git worktree add` is reported with its output and the run stops before any edit, because an edit on the wrong branch is the failure this step prevents.
