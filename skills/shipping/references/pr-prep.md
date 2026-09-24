# PR prep

Prepare a pull request a reviewer can approve on the first pass: a clean worktree, a commit story that tells the change, and a body that answers why, what, and how it was proven. The enemy is polish that hides a behavior change inside a rewrite. The overcorrection is a history rewrite nobody asked for, or a body padded with a checklist nobody reads.

## Worktree hygiene

Before committing, merging, or deploying from a worktree, stop every live agent holding it, including grandchildren you never directly launched.
A delegate's children do not inherit its brief, so a read-only instruction never reaches them.
Confirm each stop, then run `git status` and read the tree about to ship.

## Commit story

Commit liberally while working, then rebase into small, ordered, individually-landable commits before opening the PR.
Amend a fix into a just-made commit; make a new commit when it is separable.
When regrouping, the usual dependency order is schema or storage, core logic, wiring and integration, UI or surface behavior, then tests.
Regroup only commits not yet pushed; rewrite pushed history only when the user asks for it or names the plan.
Capture the tree before rewriting pushed history:
```bash
gh pr view <PR> --json title,headRefName,baseRefName,state,commits
git fetch origin <headRefName> <baseRefName>
ORIGINAL_TREE=$(git rev-parse origin/<headRefName>^{tree})
```
Verify it afterward, and do not push if the tree changed unintentionally:
```bash
echo "Original tree: $ORIGINAL_TREE"
echo "Current tree:  $(git rev-parse HEAD^{tree})"
git diff origin/<headRefName> --stat
```

## PR too large to review

Inspect commits, diff size, changed paths, generated files, and the description for noisy commits, a stale description, unrelated changes, mixed mechanical and logic changes, missing tests, or unclear reviewer entry points.
Propose a plan before rewriting history or force-pushing.
When behavior must stay untouched, improve the description instead: a TL;DR that matches the actual diff, core files separated from generated or mechanical files, risky changes, migration order, rollout plan and test coverage called out, and links to issue trackers, dashboards, or design docs that explain intent.
Never hide a meaningful behavior change inside a "cleanup" commit or note.
Do not bypass hooks unless the user explicitly asks.
If the PR is still too large to review with notes alone, recommend splitting it rather than polishing around the problem.
Prefer several narrow PRs to one large PR, and push back when review feedback drifts from the stated intent.

## Title

`type(scope): subject` in Conventional Commits form.
Type is one of `feat`, `fix`, `docs`, `refactor`, `test`, `chore`, `perf`.
Scope is the changed area, such as a directory or module name.
Subject is short and imperative; name a real symbol when one carries the change, for example `fix(pstack): retarget opening-a-pr babysit trigger`.
No trailing period.

## Body

A repository pull-request template wins; fill its own `Closes #<n>` line rather than adding a second one.
Without a template, use these sections in order, dropping one with nothing to say:
- `## Why`: intent and approach in one or two short paragraphs; the goal goes here; no SHAs or rebase genealogy, no "based on main" preamble.
- `## Scope`: bullets naming real symbols and paths; name both sides of a rename or retarget; state in or out of scope only when the boundary matters.
- `## Tradeoffs`: only rejected alternatives a reviewer would otherwise ask about; skip when there was no real choice.
- `## Blast Radius`: one to three sentences naming who or what the change touches, why it is safe or risky, and the cost of staying red without the fix.
- `## Verification`: each real run path and its outcome, exo's proof line included; for a performance change, one primary number with unit in `before → after` form; link fuller evidence rather than tabulating it.
End on `Closes #<n>` when an issue is behind the change.
Never use `## Summary` or `## Test plan`; a commit body does not restate its subject.
Never paste full SHAs, swarm or arena recitals, lever-correction essays, file-by-file checklists, or "CLEAN" verdicts.
Attach video or screenshots only when they prove a claim.
The PR body is the squash commit body; cut it before it passes about 40 lines.

## Readiness

Run `gh pr view <number>` before stating a PR's status, rather than relying on a remembered state.
Confirm a new PR opened non-draft; if it opened as a draft anyway, run `gh pr ready <number>`.

## Judgment

- The user's instruction outranks a cleaner commit story: pushed history is rewritten only when the user names it.
- A split outranks a polished description when notes alone cannot make the pull request reviewable.
