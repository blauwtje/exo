# PR prep

## Worktree hygiene

- Before a commit, merge or deploy from a worktree → halt every agent running in it, down to agents a delegate spawned; a brief stays with its agent, so no read-only order reaches them.
- Verify each halt, then read `git status` and the tree that will ship.
- Branch mixes in unrelated work → patch the change out, apply it in a fresh worktree from the base.

## Commit story

- Regroup only commits not yet pushed; a pushed commit changes only through a force push, which nothing here authorizes.
- Commit liberally while working, then rebase into small, ordered, individually-landable commits before opening the PR.
- Fix to a just-made commit → amend; separable fix → new commit.
- Regrouping → usual dependency order: schema or storage, core logic, wiring and integration, UI or surface behavior, tests.

## PR too large to review

- Never hide a meaningful behavior change inside a "cleanup" commit or note.
- Read the commits, line count, paths touched, generated files, description.
- Note what slows a reviewer: noise commits, a description the diff outgrew, off-goal changes, mechanical edits tangled with logic, absent tests, no clear place to start.
- Improve the description, not the pushed history.
- Open it with a TL;DR true to the current diff; set core files apart from generated or mechanical ones.
- Flag risky edits, migration order, rollout, test coverage; link any issue, dashboard or design doc giving the intent.
- Notes alone cannot make it reviewable → split recommendation in the report.

## Title

- `type(scope): subject`, Conventional Commits, no trailing period.
- Type: one of `feat`, `fix`, `docs`, `refactor`, `test`, `chore`, `perf`.
- Scope: changed area, such as a directory or module name.
- Subject: short imperative naming the symbol the change centers on, if one does, as in `fix(ship): gate pr-merge on the verifier verdict`.

## Body

- No `## Summary` or `## Test plan`.
- No subject line repeated in a commit body.
- Leave out full SHAs, narration of parallel or contest runs, essays on lever corrections, checklists walking every file, "CLEAN" verdicts.
- Keep the PR body under about 40 lines; it is the squash commit body.
- Video or screenshots only when they prove a claim.
- Sections in order, dropping one with nothing to say:
  - `## Why`: goal and how the change reaches it, at most two brief paragraphs; no SHAs, rebase genealogy or "based on main" preamble.
  - `## Scope`: a bullet per real symbol or path; rename or retarget → old and new name; mark in or out only where that line matters.
  - `## Tradeoffs`: only rejected alternatives a reviewer would otherwise ask about; skip with no real choice.
  - `## Blast Radius`: one sentence, three at most: whom or what the change reaches, what makes it safe or risky, cost of staying red without the fix.
  - `## Verification`: each real run path and its outcome, exo's proof line included; link fuller evidence, no tables of it.
- Performance change → `## Verification` gives one primary number with its unit, as `before → after`.
