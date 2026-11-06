# PR prep

Goal: open a pull request a reviewer can read, with small ordered commits and a body that matches the diff.

## Worktree hygiene

- Before a commit, merge or deploy from a worktree, halt every agent running in it, down to agents a delegate spawned. A brief stays with its agent, so no read-only order reaches them.
- Verify each halt, then read `git status` and the tree that will ship.
- When the branch mixes in unrelated work, patch the change out and apply it in a fresh worktree from the base.

## Commit story

- Regroup only commits not yet pushed. A pushed commit changes only through a force push, which nothing here authorizes.
- Commit liberally while working, then rebase into small, ordered, individually-landable commits before opening the PR.
- Amend a fix to a just-made commit and give a separable fix its own commit.
- Regroup in the usual dependency order: schema or storage, core logic, wiring and integration, UI or surface behavior, tests.

## PR too large to review

- Describe every meaningful behavior change as what it is, not as a "cleanup" commit or note.
- Read the commits, line count, paths touched, generated files, description.
- Note what slows a reviewer: noise commits, a description the diff outgrew, off-goal changes, mechanical edits tangled with logic, absent tests, no clear place to start.
- Improve the description, not the pushed history.
- Build the body with `node "${CLAUDE_SKILL_DIR}/scripts/pr-body.mjs" --help`'s sections, proof lines and issue table, then pass its output as `--body`.
- When notes alone cannot make it reviewable, put a split recommendation in the report.

## Title

- Write `type(scope): subject` as a Conventional Commit with no trailing period.
- Type is one of `feat`, `fix`, `docs`, `refactor`, `test`, `chore`, `perf`.
- Scope is the changed area, such as a directory or module name.
- Subject is a short imperative naming the symbol the change centers on, if one does, as in `fix(ship): gate pr-merge on the verifier verdict`.

## Body

- Skip `## Summary` and `## Test plan`.
- Do not repeat the subject line in a commit body.
- Leave out full SHAs, narration of parallel or contest runs, essays on lever corrections, checklists walking every file, "CLEAN" verdicts.
- Keep the PR body under about 40 lines, because it is the squash commit body.
- Add video or screenshots only when they prove a claim.
- Write the sections in order and drop one with nothing to say:
  - `## Why` gives the goal and how the change reaches it in at most two brief paragraphs, and links any issue, dashboard or design doc giving the intent. It has no SHAs, rebase genealogy or "based on main" preamble.
  - `## Scope` has a bullet per real symbol or path. A rename or retarget gives the old and new name, and in or out marks appear only where that line matters.
  - `## Tradeoffs` lists only rejected alternatives a reviewer would otherwise ask about, and is skipped when there was no real choice.
  - `## Blast Radius` takes one sentence, three at most: whom or what the change reaches, what makes it safe or risky, the cost of staying red without the fix.
  - `## Verification` gives each real run path and its outcome, exo's proof line included, and links fuller evidence without tables of it.
- For a performance change, `## Verification` gives one primary number with its unit, written `before → after`.
