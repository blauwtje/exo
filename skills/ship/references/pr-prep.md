# PR prep

Prepare a pull request a reviewer can approve on the first pass: a clean worktree, a commit story that tells the change, and a body that answers why, what, and how it was proven. The enemy is polish that hides a behavior change inside a rewrite. The overcorrection is a history rewrite nobody asked for, or a body padded with a checklist nobody reads.

## Worktree hygiene

Halt every agent running in a worktree before a commit, merge or deploy from it, down to agents a delegate spawned: a brief stays with its agent, so no read-only order reaches them.
Verify each halt, then read `git status` and the tree that will ship.
When the branch mixes in unrelated work, patch the change out and apply it in a fresh worktree from the base.
That keeps unrelated work from riding along in the pull request.

## Commit story

Commit liberally while working, then rebase into small, ordered, individually-landable commits before opening the PR.
Amend a fix into a just-made commit; make a new commit when it is separable.
When regrouping, the usual dependency order is schema or storage, core logic, wiring and integration, UI or surface behavior, then tests.
Regroup only commits not yet pushed, because a pushed commit changes only through a force push, which nothing here authorizes.

## PR too large to review

Read the commits, line count, paths touched, which files are generated, and the description.
Note what slows a reviewer: noise commits, a description the diff outgrew, off-goal changes, mechanical edits tangled with logic, absent tests, or no clear place to start.
Improve the description rather than the history, because pushed history stays as it is.
Open it with a TL;DR true to the current diff, and set core files apart from generated or mechanical ones.
Flag risky edits, the order migrations run in, the rollout and what tests cover, and link any issue, dashboard or design doc giving the intent.
Never hide a meaningful behavior change inside a "cleanup" commit or note.
When notes alone cannot make it reviewable, put a split recommendation in the report, because several narrow PRs review faster than one large one.

## Title

`type(scope): subject` in Conventional Commits form.
Type is one of `feat`, `fix`, `docs`, `refactor`, `test`, `chore`, `perf`, so a reader knows the kind of change before the diff.
Scope is the changed area, such as a directory or module name, so a reader finds the change by its place.
Subject is a short imperative naming the symbol the change centers on, if one does, as in `fix(ship): gate pr-merge on the verifier verdict`.
No trailing period.

## Body

Use these sections in order, dropping one with nothing to say:
- `## Why`: the goal and how the change reaches it, in at most two brief paragraphs; no SHAs or rebase genealogy, no "based on main" preamble.
- `## Scope`: a bullet per real symbol or path; a rename or retarget gives old and new name; mark in or out only where that line matters.
- `## Tradeoffs`: only rejected alternatives a reviewer would otherwise ask about; skip when there was no real choice.
- `## Blast Radius`: at most three sentences on whom or what the change reaches and what makes it safe or risky.
  Name the cost of staying red without the fix.
- `## Verification`: each real run path and its outcome, exo's proof line included; for a performance change, one primary number with unit in `before → after` form; link fuller evidence rather than tabulating it.
End on `Closes #<n>` when an issue is behind the change.
Never use `## Summary` or `## Test plan`, and never repeat the subject line in a commit body.
Leave out full SHAs, per-lane swarm or arena narration, essays on lever corrections, checklists walking every file, and verdicts reading "CLEAN".
Attach video or screenshots only when they prove a claim.
The PR body is the squash commit body; cut it before it passes about 40 lines.

## Judgment

- A pushed commit outranks a cleaner commit story: regroup only what is not yet pushed.
- A split recommendation outranks a polished description when notes alone cannot make the pull request reviewable.
