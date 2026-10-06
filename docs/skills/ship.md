# ship

Takes finished commits as far as you choose: keep local, push, open a pull request, or merge it.

## When it runs

- `build` or `find-cause` has committed a change.
- You ask to push, open or merge a pull request, fix its failing checks, or answer review comments.

## What you get

- One summary and one lettered question. The route you pick runs to the end.
- A merge only after every check passes. The wait stops after 20 minutes.
- A failed check leaves the pull request open, with the reason.
- No branch deletion, forced merge or release.

## Source

`skills/ship/SKILL.md` and `skills/ship/scripts/ship.mjs`.
