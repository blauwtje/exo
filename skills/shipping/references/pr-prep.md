# PR prep

Prepare a pull request a reviewer can approve on the first pass: a clean worktree, a commit story that tells the change, and a body that answers why, what, and how it was proven. The enemy is polish that hides a behavior change inside a rewrite. The overcorrection is a history rewrite nobody asked for, or a body padded with a checklist nobody reads.

## Worktree hygiene

Before committing, merging, or deploying from a worktree, stop every live agent holding it, including grandchildren you never directly launched.
A delegate's children do not inherit its brief, so a read-only instruction never reaches them.
Confirm each stop, then run `git status` and read the tree about to ship.
When the branch mixes in unrelated work, patch the change out and apply it in a fresh worktree from the base.
That keeps unrelated work from riding along in the pull request.

## Commit story

Commit liberally while working, then rebase into small, ordered, individually-landable commits before opening the PR.
Amend a fix into a just-made commit; make a new commit when it is separable.
When regrouping, the usual dependency order is schema or storage, core logic, wiring and integration, UI or surface behavior, then tests.
Regroup only commits not yet pushed, because a pushed commit changes only through a force push, which nothing here authorizes.

## PR too large to review

Inspect commits, diff size, changed paths, generated files, and the description.
Look for noisy commits, a stale description, unrelated changes, mixed mechanical and logic changes, missing tests, or unclear reviewer entry points.
Improve the description rather than the history, because pushed history stays as it is.
Give it a TL;DR that matches the actual diff, and separate core files from generated or mechanical ones.
Call out risky changes, migration order, rollout plan and test coverage, and link the issues, dashboards, or design docs that explain intent.
Never hide a meaningful behavior change inside a "cleanup" commit or note.
When notes alone cannot make it reviewable, put a split recommendation in the report, because several narrow PRs review faster than one large one.

## Title

`type(scope): subject` in Conventional Commits form.
Type is one of `feat`, `fix`, `docs`, `refactor`, `test`, `chore`, `perf`, so a reader knows the kind of change before the diff.
Scope is the changed area, such as a directory or module name, so a reader finds the change by its place.
Subject is short and imperative, and names a real symbol when one carries the change.
For example `fix(shipping): gate pr-merge on the verifier verdict`.
No trailing period.

## Body

Use these sections in order, dropping one with nothing to say:
- `## Why`: intent and approach in one or two short paragraphs; the goal goes here; no SHAs or rebase genealogy, no "based on main" preamble.
- `## Scope`: bullets naming real symbols and paths; name both sides of a rename or retarget; state in or out of scope only when the boundary matters.
- `## Tradeoffs`: only rejected alternatives a reviewer would otherwise ask about; skip when there was no real choice.
- `## Blast Radius`: one to three sentences naming who or what the change touches and why it is safe or risky.
  Name the cost of staying red without the fix.
- `## Verification`: each real run path and its outcome, exo's proof line included; for a performance change, one primary number with unit in `before → after` form; link fuller evidence rather than tabulating it.
End on `Closes #<n>` when an issue is behind the change.
Never use `## Summary` or `## Test plan`; a commit body does not restate its subject.
Never paste full SHAs, swarm or arena recitals, lever-correction essays, file-by-file checklists, or "CLEAN" verdicts.
Attach video or screenshots only when they prove a claim.
The PR body is the squash commit body; cut it before it passes about 40 lines.

## Judgment

- A pushed commit outranks a cleaner commit story: regroup only what is not yet pushed.
- A split recommendation outranks a polished description when notes alone cannot make the pull request reviewable.
