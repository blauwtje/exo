# shipping

Ends a code-changing run by carrying its commits as far as you pick: kept local, pushed, a pull request, or a pull request merged once its checks pass.

## When it fires

When `implementing`, `implementing-batch` or `debug` has committed a change, and when you ask to push, open a pull request, or merge open pull requests.

## What you get

- One overview and one question; the route you pick runs to its end with no follow-up command.
- A check wait bounded at 20 minutes, then a merge only when the GitHub API reads the pull request as clean with every check passed, confirmed merged before it is reported.
- A red check, a failed gate or a timeout leaves the pull request open, with the reason in the report.
- No branch deletion, no forced merge and no release: those stay yours or the repository workflow's.

## Where its rules live

`skills/shipping/SKILL.md`, with the route steps and the bounded wait in `skills/shipping/scripts/ship.mjs` and the pull-request fields in `skills/issuing/references/fields.md`.
