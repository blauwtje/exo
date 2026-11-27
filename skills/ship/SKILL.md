---
name: ship
description: "Pushes, opens, watches and merges pull requests, fixing failing checks, conflicts and review comments. Use when the user says 'ship it' or 'open a PR', or asks to push, watch or merge. Not for releases."
argument-hint: "[pull request numbers]"
model: sonnet
effort: medium
---

# Ship

**Nothing leaves the machine without a yes.** A push, a pull request and a merge cannot be taken back, and each one shows your work to other people. Ask for each one, then carry it through until the pull request passes its checks, has every comment answered and merges cleanly, or until you reach something only the user can decide.

## Ask

Confirm the target is the one the user named. Then give three lines, what changed, what you verified and what is left, and offer the routes: push, open a pull request, or merge. File no follow-up issue before a yes.

## Prepare

- Commit a dirty tree as ordered commits and show their subjects. Change a pushed commit only with a new commit.
- Title the pull request like the recent commit subjects. Follow the repository's template and keep the body under 40 lines: why, scope, how it was verified, `Closes #<n>`.
- Before a push or a merge, run the check that the project's CLAUDE.md, README or CI names, for example `npm run check`. Push nothing when it fails.

## Merge

Wait for the checks in the background, and stop waiting after 20 minutes. Merge, then read the state back to confirm it. For several pull requests, check each one, drop a failing one, and merge stacked ones from the bottom up, stopping at the first failure.

## Watch

Read the state with `gh pr view <n> --json mergeable,statusCheckRollup,reviews,comments`. Work in this order, and push one round's fixes together:

1. **Conflicts.** Resolve each file from its markers, regenerate a lockfile with the package manager, run the check, and push a merge commit. Use a merge commit, not a rebase: the squash merge lands it as one commit anyway.
2. **Failing checks.** Read the log first. Run the formatter, and fix only failures inside the diff. Send a code fix to a fresh `exo:builder` that writes a failing test first.
3. **Comments.** Act only on what you agree with, and send code changes to `exo:builder` the same way. Ask before acting on a security, data or high-severity finding. Write each reply to `<scratch>/reply-<n>.md` and post it after the fix is pushed, citing the commit.

The pull request is ready when the checks pass, every comment is answered and it merges cleanly. Run `gh pr ready <n>` when it is a draft.

## When stuck

| Situation | Do |
|---|---|
| A check failed after two fixes | Name what both fixes assumed and test that. Stop after three rounds. |
| It passes locally and fails in CI | Compare versions, environment and base commit before you change code. Report a suspected flake; do not rerun it blindly. |
| A hook or check blocks the push | Fix the cause. Never use `--no-verify`, force push or weaken the check. |
| A comment asks for a change you disagree with | Reply with your reason. Do not change the code just to close the thread. |
| A fix needs a product decision | Stop and ask. |

## Report

```text
Merged #42. 2 fixes pushed (a1b2c3d..e4f5a6b): a lint error and a missing null check.
Comments: 3 answered, 1 left for you: the reviewer wants the delimiter configurable.
```

Say what happened (pushed, opened, merged, kept local, or why it stopped), the fixes as a count and a commit range, the comments answered or left, and what needs the user.

Next: `exo:learn`, when this run needed the same correction twice.
