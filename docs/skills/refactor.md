# refactor

Restructures code without changing what it does, and deletes the old version.

## When it runs

- You name a rename, move, split or API reshape that must keep behavior the same.
- Someone wants to keep a shim or a re-export "for compatibility".

Not for choosing what to refactor, changing behavior (`build`), or an unexplained failure (`find-cause`).

## What you get

- Current behavior captured in a test or script before the first edit. A passing type check does not count.
- Every caller moved and the old API deleted in the same change.
- No new layers for needs that do not exist yet.
- A report: what changed, the before and after comparison, lines removed against added.

## Source

`skills/refactor/SKILL.md`, `references/behavior-pin.md` and `references/legacy-api.md`.
