# improve

Runs a keep-or-reset loop on your repo against one fixed score command, until you stop it.

## When it runs

Only when you type `/exo:improve <goal>`.

Not for a one-off change. Ask for it directly.

## What you get

- Before round 1 it settles with you the files it may change, the score command, whether higher or lower is better, and the time limit per run. After that it asks nothing.
- It works on a new branch `improve/<tag>` and stops if your working tree is not clean. Your current branch stays as it was.
- It never changes the score command or the files it reads.
- Round 0 runs the command on unchanged code and logs the baseline.
- Each round tries one idea as one commit and sends the command's output to a log file, then reads the score from that log.
- A better score keeps the commit. An equal score from less code is also kept. Any other equal score, or a worse one, resets the branch to the last kept commit. A crash or a run over the time limit is logged and reset.
- Every round is one row in the untracked `improve-<tag>.tsv`: commit, score, status, description.
- Started again on its own `improve/<tag>` branch, it resets to the last kept commit and continues from that run's rows; on any other branch it starts a new run.
- It runs until you interrupt it, then reports the best score against the baseline.

## Source

`skills/improve/SKILL.md`.
