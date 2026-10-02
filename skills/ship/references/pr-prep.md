# PR prep

## Worktree hygiene

- Halt every agent running in a worktree before a commit, merge or deploy from it, down to agents a delegate spawned: a brief stays with its agent, so no read-only order reaches them.
- Verify each halt, then read `git status` and the tree that will ship.
- When the branch mixes in unrelated work, patch the change out and apply it in a fresh worktree from the base.

## Commit story

- Regroup only commits not yet pushed, because a pushed commit changes only through a force push, which nothing here authorizes.
- Commit liberally while working, then rebase into small, ordered, individually-landable commits before opening the PR.
- Amend a fix into a just-made commit; make a new commit when it is separable.
- When regrouping, the usual dependency order is schema or storage, core logic, wiring and integration, UI or surface behavior, then tests.

## PR too large to review

- Never hide a meaningful behavior change inside a "cleanup" commit or note.
- Read the commits, line count, paths touched, which files are generated, and the description.
- Note what slows a reviewer: noise commits, a description the diff outgrew, off-goal changes, mechanical edits tangled with logic, absent tests, or no clear place to start.
- Improve the description, not the pushed history.
- Open it with a TL;DR true to the current diff, and set core files apart from generated or mechanical ones.
- Flag risky edits, the order migrations run in, the rollout and what tests cover, and link any issue, dashboard or design doc giving the intent.
- When notes alone cannot make it reviewable, put a split recommendation in the report.

## Title

- Use `type(scope): subject` in Conventional Commits form, with no trailing period.
- Type is one of `feat`, `fix`, `docs`, `refactor`, `test`, `chore`, `perf`.
- Scope is the changed area, such as a directory or module name.
- Subject is a short imperative naming the symbol the change centers on, if one does, as in `fix(ship): gate pr-merge on the verifier verdict`.

## Body

- Never use `## Summary` or `## Test plan`.
- Never repeat the subject line in a commit body.
- Leave out full SHAs, narration of parallel or contest runs, essays on lever corrections, checklists walking every file, and verdicts reading "CLEAN".
- Cut the PR body before it passes about 40 lines, because it is the squash commit body.
- Attach video or screenshots only when they prove a claim.
- Use these sections in order, dropping one with nothing to say:
  - `## Why`: the goal and how the change reaches it, in at most two brief paragraphs; no SHAs or rebase genealogy, no "based on main" preamble.
  - `## Scope`: a bullet per real symbol or path; a rename or retarget gives old and new name; mark in or out only where that line matters.
  - `## Tradeoffs`: only rejected alternatives a reviewer would otherwise ask about; skip when there was no real choice.
  - `## Blast Radius`: one sentence, three at most, on whom or what the change reaches, what makes it safe or risky, and the cost of staying red without the fix.
  - `## Verification`: each real run path and its outcome, exo's proof line included; link fuller evidence rather than tabulating it.
- A performance change's `## Verification` gives one primary number with its unit, in `before → after` form.
