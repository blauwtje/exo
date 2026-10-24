# improve

Runs a keep-or-reset loop that raises one score in your repo, round after round, until you stop it.

## When it runs

Only when you type `/exo:improve <goal>`.

Not for a one-off change. Ask for it directly.

## What you get

- It works out from your repo which files it may change, which command measures the goal, whether higher or lower is better, and how long one run may take.
- It asks you at most one plain question, about the goal itself, and none when your goal already says what should get better. After setup it asks nothing.
- No command in your repo measures the goal → it writes one and commits it on the run's own branch, not yours. It checks that the new command notices a deliberately worse file, else it rewrites it.
- The score command and every file it reads are frozen. A change to them stops the run.
- Round 0 runs the command 3 times on unchanged code. Their median is the baseline, and their spread sets how big a change must be to count.
- The work happens in `.worktrees/improve-<tag>` on a new branch `improve/<tag>`. Your checkout and any uncommitted changes stay as they were.
- Each round, one worker reads the earlier rounds, picks one large idea that no earlier round tried, passes it through a check, edits and commits it.
- A script then runs the score command, sends its output to `.exo/improve/run.log`, and reads the score from that log.
- A better score keeps the commit. An equal score from less code is also kept. Any other equal score, or a worse one, resets the branch to the last kept commit.
- A run that crashes or goes over the time limit gets one rerun when the cause looks like the machine, then is logged as a crash and reset.
- While one round scores, the next worker already prepares its idea, so rounds follow each other closely. A score that measures time skips this, because the extra work would skew it.
- Out of ideas 3 rounds in a row → the next worker rereads the files and tries a larger change; the loop keeps going.
- Every round is one row in the untracked `.exo/improve/<tag>.tsv`: commit, score, status, description.
- Ask it to continue an earlier run and it resets to that run's last kept commit and goes on. Otherwise it begins a new run.
- It runs until you interrupt it, then reports the best score against the baseline, the branch and the worktree. It also stops by itself when a round hangs or the score command changed.

## Source

`skills/improve/SKILL.md`.
