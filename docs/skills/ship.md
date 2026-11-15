# ship

Takes finished commits as far as you choose: keep local, push, open a pull request, or merge it.

## When it runs

- `build` or `diagnose` has committed a change.
- You ask to push, open or merge a pull request, fix its failing checks, or answer review comments.

## What you get

- One summary and one lettered question. The route you pick runs to the end.
- A merge only after every check passes. The wait stops after 20 minutes.
- A failed check leaves the pull request open, with the reason.
- A dirty tree is first proposed as ordered commits grouped by file and purpose, shown with their subjects, and committed only on your yes. The commits together equal the tree exactly.
- A pull request body of at most 40 lines: why, scope, verification and `Closes #<n>`.
- A watch that fixes conflicts, failing checks (3 rounds at most) and review comments, then stops at merge-ready.
- No branch deletion, forced merge or release.

## Source

`skills/ship/SKILL.md` and `skills/ship/scripts/ship.mjs`.
