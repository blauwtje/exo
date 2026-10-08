---
name: refactor
description: "Use when a named refactor, rename, move or internal API reshape must keep behavior unchanged, or a shim or compatibility re-export tempts. Not for finding what to refactor, a behavior change (build), or an unproven failure (find-cause)."
argument-hint: <the refactor to run>
---

# Refactor

Change structure with behavior pinned; leave less code than you found. The enemy is the half-finished move: old API kept beside the new, a shim forwarding to it, or a reshape trusted because it type-checks. The overcorrection is a refactor growing layers for needs nobody has written yet.

## When to use

- Named rename, move, extraction, split, flattening or reshape of an internal API whose results must not change.
- Pull to keep the old signature, accept both shapes, or leave a re-export "for compatibility".
- Not for a behavior change: `build` owns it; mixed request → refactor first, then the change.
- Not for persisted data, a stored format or a consumer outside this repository: `build` keeps those compatible on purpose via `../build/references/data-migration.md`.
- Not for a failure with unproven cause: `find-cause` owns it.

## The loop

1. **Pin behavior before the first move.** Capture current outputs in a test, snapshot or before/after script over the inputs that matter; type check and lint pin nothing, both pass on a wrong price.
2. **Name the target shape.** One sentence: module layout and call graph as if built today; reshape removes branches, layers or states, never adds indirection.
3. **Subtract first.** Delete dead code, one-caller wrappers and orphaned references before building the new shape.
4. **Migrate every caller, then delete the old API, in the same change.** No shim, deprecated wrapper, both-shapes signature or re-export stays, because nothing then forces the last caller over. Search strings, docs, scripts and tests too; renames miss usages there.
5. **Build no seam for a future caller.** No base class, registry, factory or flag with one implementation; seam arrives with its second adapter; unused sketch code is dropped, not finished.
6. **Prove equality on the real code.** Rerun the pin against old and new versions, quote the comparison; "it compiles" or a green suite that never covered the moved code proves nothing.
7. **Keep it only if reading got easier.** Revert a step that lowers no reader load (fewer files to trace, less state to hold).
8. **Report.** Structure changed, pin, equality evidence, lines removed vs added, what was reverted, and that no behavior was added.

## Red flags

| The excuse | What holds |
|---|---|
| "Accept both shapes for now; callers move when someone touches them." | Nobody touches them; dual path becomes permanent. Migrate now; say what the line cap or open PR costs. |
| "Keep the re-export so nothing breaks." | Inside one repository a search proves no caller is left; a kept re-export invites new ones. |
| "Types and lint pass, so the prices held." | Types check shapes, not values; only a before/after run on the same inputs shows equality. |
| "No time for tests on a mechanical split." | A throwaway comparison script takes minutes, no committed test needed. |
| "Leave it extensible for the channels coming next quarter." | One-implementation seam = indirection; next channel adds its seam when it lands. |

## References

| File | Read it when |
|---|---|
| `references/behavior-pin.md` | Step 1 when no test covers the code, and step 6 for the comparison. |
| `references/legacy-api.md` | Step 4, before keeping any old path, and when a caller belongs to another team's open work. |

## Judgment

- Pin outranks target shape: a step that breaks it is reverted, never the pin loosened.
- Delete-old-API rule covers only APIs whose every caller is in this repository; anything outside follows `../build/references/data-migration.md`.
- Deletion outranks addition when both reach the target shape.
- Explicit user request to keep the old API outranks step 4; state its cost once, keep it with a removal date.
