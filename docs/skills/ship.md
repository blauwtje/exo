# ship

Takes finished commits as far as you choose: keep local, push, open a pull request, or merge it.

## When it runs

- `build` or `find-cause` has committed a change.
- You ask to push, open or merge a pull request, fix its failing checks, or answer review comments.

## What you get

- One summary and one lettered question. The route you pick runs to the end.
- A merge only after every check passes. The wait stops after 20 minutes.
- A failed check leaves the pull request open, with the reason.
- A dirty tree is first proposed as ordered commits grouped by file and purpose, shown with their subjects, and committed only on your yes. The commits together equal the tree exactly.
- A pull request body a reviewer can read: why, what changed by theme, read order, risks, the gate's own proof lines, and follow-ups. Empty sections are left out and the body stays within `defaults.prBodyBytes` (4096).
- When the pull request closes an issue with checklist items, an acceptance table with one row per item: met, unmet or unverifiable, each with where the evidence is. ship never edits the issue.
- No branch deletion, forced merge or release.

## Source

`skills/ship/SKILL.md`, `skills/ship/scripts/ship.mjs`, `skills/ship/scripts/pr-body.mjs` and `skills/ship/scripts/commit-split.mjs`.
