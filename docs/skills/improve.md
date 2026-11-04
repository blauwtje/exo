# improve

Runs a keep-or-reset loop that raises one score in your repo, round after round, until you stop it.

## When it runs

Only when you type `/exo:improve <goal>`. It starts in your current session.

Not for a one-off change. Ask for it directly in plain words.

## What you get

- It works out from your repo which files it may change, which command measures the goal, whether higher or lower is better, and how long one run may take.
- It asks you at most one plain question, about the goal itself, and none when your goal already says what should get better. After setup it asks nothing.
- No command in your repo measures the goal → it writes one and commits it on the run's own branch, not yours.
- The score command and every file it reads are frozen. A change to them stops the run.
- Setup runs the command twice on unchanged code; the mean is the baseline, and the spread between the runs shows how noisy the score is.
- The work happens in `.worktrees/improve-<tag>` on a new branch `improve/<tag>`. Your checkout and any uncommitted changes stay as they were.
- Each round, one worker reads a brief with the earlier rounds, picks one idea no earlier round tried, edits only the files in scope, and commits it.
- A script then runs the score command and reads the score from its output. A score that varies from run to run is run again, up to 3 times, and each run's output is kept.
- A commit is kept only when its gain over the last kept commit is larger than the noise: the lower end of the 95% interval of the gain stays above zero. A score that never varies decides on one run, as before: a better score keeps the commit, and an equal score from less code is also kept. Anything else resets the branch to the last kept commit.
- A commit that touches a file outside the scope, a run that crashes, or a round whose every run goes over the time limit or prints no score, is logged and reset.
- Out of ideas → the worker says so and the next round starts again.
- Every round is one row in the untracked `.exo/improve/<tag>.tsv`: commit, mean score, status, description; a rerun round's description opens with its run count, standard error, interval and aborted runs.
- Ask it to continue an earlier run and it resets to that run's last kept commit and goes on. Otherwise it begins a new run.
- It runs until you interrupt it, then reports the best score against the baseline, the branch and the worktree. It also stops by itself when the score command changed, a reset failed, or 10 rounds in a row kept nothing.

## Source

`skills/improve/SKILL.md`.
