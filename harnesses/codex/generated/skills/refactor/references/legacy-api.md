# Legacy API

Refactor reshapes an internal API → callers move to the new form, old form deleted in the same change. A shim kept beside the new form makes every later change treat the codebase as append-only. Overcorrection: deleting a caller nobody inventoried, breaking a consumer the search never found.

## Scope

- Covers a function, module path, class, route or type whose every caller lives in this repository.
- Not persisted data, a stored or wire format, a published package or an endpoint another deployment calls; those keep compatibility on purpose, `build` migrates them in phases.
- Private package in a monorepo → internal when the same change can update every consumer.

## Inventory the callers

1. Search symbol and import path across source, tests, scripts, docs, config and string literals; a rename misses a caller named inside a string.
2. List each caller with its file; migrate all before touching the old definition.
3. Delete the old definition, overload branch or re-export file, then search again: zero hits = move finished.
4. Update tests to call the new form; delete a test that only protected the old implementation detail.

## When a caller is hard to move

| Pressure | What holds |
|---|---|
| A line cap on the review | Migrating callers is mechanical and reviews fast; report that the cap cannot hold with the caller count, never hit it with a shim. |
| Another team's open PR touches a caller | One-line call-site change = trivial rebase for them; tell them it lands, keep no second path for them. |
| "Callers move when someone next touches them" | Never happens; old path becomes permanent. |
| A deadline | Shim ships the deadline and the debt; migrating ships the refactor. Say which fits the time. |

## The one exception

Adapter kept on purpose needs all three: a named reason no in-repository change can remove, an owner, and a removal date written beside it. Explicit user request counts as such a reason. Missing any → shim, delete it.

## Judgment

- Zero-hit search outranks a caller list believed complete from memory; rerun it after the delete.
- The exception's three conditions outrank a deadline or line cap alone.
- Scope decides first: caller outside this repository keeps compatibility on purpose, never this file's delete-in-place rule.
