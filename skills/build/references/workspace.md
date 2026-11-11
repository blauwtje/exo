# Workspace

Where a run commits is settled before its first edit, so no work lands on a branch the user did not choose.

- Ask where a code-changing run commits before its first edit, and commit only where the answer puts it.
- An explicit instruction in the request (a branch name, "work on main", "use a worktree") is the answer, so skip the script below.
- An explicit branch name switches the checkout to it, creating it when new, before `start-run.mjs`.
- A run another stage started holds its caller's answer, so skip the script below.
- Otherwise run `node "${CLAUDE_SKILL_DIR}/../../lib/workspace.mjs"` and follow its one line.
- For the plan's own `Repository:` folder, add `--repository <dir> --plan-repository`.
- When the root `CLAUDE.md` or `AGENTS.md` already says work commits on the default branch, add `--current-recommended`. The menu keeps Branch, Worktree, Current branch as A, B, C and marks (C).
- `stop <reason>` means editing nothing before the answer.
  - When the reason ends "an init would capture files the plan never named", put a two-option menu as the question: `git init -b main` in that folder committing its current files, or another folder.
  - Wait for the letter, and on `A` run that init and commit there.
  - For any other `stop`, name the reason and end the turn.
- `init` runs `git init -b main` and commits there.
- `commit-here <where>` commits at `<where>` with no question.
- `--land` → the `ask` menu takes its (A) through `--pick` with no question.
- `ask` puts its menu as the question and waits for the letter. Before any edit, rerun the script with `--pick branch|worktree|current --name <branch-name>` for that answer.
- When the script reports a failed `git switch` or worktree creation, stop the run before any edit.
- `<branch-name>` is the plan's `Branch:` line when it names a non-default branch, else `<type>/<slug>` from the goal.
- When the session has the harness's own worktree tool, prefer it over a git-made worktree.
- Every later command runs inside the picked branch or worktree. Name that path or branch as `start-run.mjs`'s `--checkout` and the unit's checkout.
- Push only after `ship`.
