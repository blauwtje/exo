# Landing

This file covers the start-of-run cleanup and how a finished branch lands on `main`.

## Start of run

- At the start of a run, squash and push leftover commits on `main`, then run `git pull --ff-only` and `git fetch --prune`.
- Then remove every worktree and branch merged into `main` or marked `: gone]` in `git branch -vv`, local and remote.

## Land

- Squash: run `node lib/check-cache.mjs --query "npm run check"` first, where `pass` skips the check and `miss` runs `npm run check` once to a log.
- Before each `git merge --squash <branch>`, run `node skills/build/scripts/squash-check.mjs --branch <branch>` and stop on a non-zero exit, keeping the branch.
- Then run `git merge --squash <branch>` and commit one Conventional Commit that copies every branch `Evidence:` and `Proof:` line into the body, with no push or pull request.
- Remove each worktree with `node skills/build/scripts/remove-worktree.mjs --kept --worktree .worktrees/<name> --run .`, one unpiped command per worktree with its exit visible and no `--force`, because `git worktree remove` deletes the excluded `.exo/`.
- When `remove-worktree.mjs` refuses, keep the worktree and branch and give the user 2-3 options.
- Delete a branch with `git branch -D <name>`, in its own command.
- Session push, at session end or when the user asks: run `git reset --soft origin/main` and commit one Conventional Commit named after the main change, with the batch's highest type (`feat` over `fix` over the rest).
- Give its body one line per squashed change plus every `Evidence:`, `Proof:` and `Drops:` line, then push `main` directly.
