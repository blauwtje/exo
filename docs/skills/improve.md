# improve

Runs a keep-or-reset loop that raises one score in your repo, round after round, until you stop it.

## When it runs

On request: ask to raise a score in a loop, in plain words. The model starts it in your current session.

Not for a one-off change. Ask for it directly.

## What you get

- It works out from your repo which files it may change, which command measures the goal, whether higher or lower is better, and how long one run may take.
- It asks you at most one plain question, about the goal itself, and none when your goal already says what should get better. After setup it asks nothing.
- No command in your repo measures the goal → it writes one and commits it on the run's own branch, not yours.
- The score command and every file it reads are frozen. A change to them stops the run.
- Setup runs the command once on unchanged code; that score is the baseline.
- The work happens in `.worktrees/improve-<tag>` on a new branch `improve/<tag>`. Your checkout and any uncommitted changes stay as they were.
- Each round, one worker reads a brief with the earlier rounds, picks one idea no earlier round tried, edits only the files in scope, and commits it.
- A script then runs the score command and reads the score from its output.
- A better score keeps the commit. An equal score from less code is also kept. Any other equal score, or a worse one, resets the branch to the last kept commit.
- A commit that touches a file outside the scope, or a run that crashes or goes over the time limit, is logged and reset.
- Out of ideas → the worker says so and the next round starts again.
- Every round is one row in the untracked `.exo/improve/<tag>.tsv`: commit, score, status, description.
- Ask it to continue an earlier run and it resets to that run's last kept commit and goes on. Otherwise it begins a new run.
- It runs until you interrupt it, then reports the best score against the baseline, the branch and the worktree. It also stops by itself when the score command changed, a reset failed, or 10 rounds in a row kept nothing.

## Source

`skills/improve/SKILL.md`.
