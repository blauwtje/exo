# refactor

Runs a named refactor with behavior pinned, and finishes it by deleting the old path rather than keeping it beside the new one.

## When it fires

A rename, move, extraction, split or reshape of an internal API has been decided and its results must not change. It also fires when a shim, a signature that accepts both shapes, or a re-export kept "for compatibility" is tempting. Finding what to refactor belongs to audit-architecture, a change that alters behavior to build-change, and a failure with an unproven cause to find-cause.

## What you get

- Current behavior pinned in a test, snapshot or before/after script before the first structural edit; a green type check or lint never counts as the pin.
- Every internal caller migrated in the same change and the old API deleted, with no shim, deprecated wrapper or re-export left behind. Persisted data and consumers outside the repository keep their compatibility through build-change.
- No new base class, registry or flag for a need that has no second implementation yet.
- A report naming the structure that changed, the pin, the old-against-new comparison, lines removed against added, and what was reverted.

## Where its rules live

`skills/refactor/SKILL.md`, with `references/behavior-pin.md` and `references/legacy-api.md`.
