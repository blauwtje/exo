# merge-prs

Merges the open pull requests of this repository, one at a time, behind hard gates.

## When it fires

Only when you ask to merge open or listed pull requests. It leaves the machine, so Claude never starts it.

## What you get

- Each pull request judged against gates read from the GitHub API, not from a local guess.
- One merge at a time, stopping at the first gate that does not pass.
- No branch deletion: that stays yours.

## Where its rules live

`skills/merge-prs/SKILL.md`. Reviewing the code itself is a different job.
