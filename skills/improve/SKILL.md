---
name: improve
description: Use when the user invokes it to improve a repo against one fixed score command, keeping a commit only when the score gets better and logging every round. Not for a one-off change.
argument-hint: "<goal>"
disable-model-invocation: true
---

# Improve a score in a loop

Change code, run one fixed score command, keep the commit when the score got better, else reset, log every round. The enemy is a loop that moves the goalposts: a changed scorer, a score read from chat, a kept commit that is not better. The overcorrection is a loop that stops to ask, so the user finds it idle.

## Setup

Run once before round 1. Ask the user only for what the goal leaves open; this is the only time you ask.

- Resume → only on branch `improve/<tag>` with `improve-<tag>.tsv` at the repo root: once the tree is clean, reset the branch to the last kept commit in its rows, dropping any unscored commit, and take that score. Skip round 0, go to Round, and ask only for what the goal leaves open.
- Run started on any other branch → new run, even when an `improve/*` branch or results file exists.
- Scope → the files you may change; every other file is read-only, the score command and everything it reads included.
- Score command → one command that prints the score; send its output to a log file, never to the chat. Name how to read the score from the log, and the direction: higher or lower is better.
- Time limit → seconds one run may take; none given → twice the baseline run's time; a run over it is killed and counts as a crash.
- Tag → today's date, such as `oct22`; branch `improve/<tag>` must not exist, except on resume, which keeps the current branch and its tag.
- Branch → create `improve/<tag>` from the current branch; never work on the current branch, except the `improve/<tag>` branch you resume.
- Working tree not clean → stop and tell the user; do not stash, reset or discard their changes.
- Results file → `improve-<tag>.tsv` at the repo root, one per run, tab-separated, header `commit	score	status	description`; add it and `improve-run.log` to the file `git rev-parse --git-path info/exclude` prints, since `.git` is a file in a linked worktree. Then no round's commit takes them and no reset removes them.
- Round 0 → run the score command on unchanged code, log that score as the first row with status `keep` and description `baseline`.
- Settled → say the scope, command, direction, limit and branch in one message, then start.

## Round

Every round tries one idea and ends in a keep or a reset. Setup done → never ask whether to go on.

1. Read the git state and `improve-<tag>.tsv`; pick an idea no earlier row tried. Out of ideas → reread the in-scope files, combine near-misses, try a larger change.
2. Edit in-scope files only.
3. Commit the idea as one commit.
4. Run the score command with all output to the log, such as `<command> > improve-run.log 2>&1`; keep the log untracked.
5. Read the score from the log, not from the chat.
6. Append one row to `improve-<tag>.tsv`: short commit hash, score, status, description.
7. Score better than the last kept score → status `keep`; the branch advances.
8. Score worse → status `discard`; reset the branch to the last kept commit. Score equal → status `keep` when the commit leaves less code than the last kept commit (simpler), else `discard` and reset.

## Crash

- Score missing from the log, nonzero exit, or run over the time limit → crash.
- Crash from a typo or missing import → fix it in the same idea, rerun.
- Crash from the idea itself, or after a few failed fixes → row with status `crash` and score `0`, reset to the last kept commit, next idea.

## Stop

- User interrupts → report the best kept score against the baseline and the branch name; leave the branch and the results file in place.

## Judgment

- Run until the user interrupts you; the user may be away. Never ask whether to continue.
- Unsure whether a change is in scope → it is not; try another idea.
