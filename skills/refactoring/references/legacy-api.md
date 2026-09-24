# Legacy API

When a refactor reshapes an internal API, its callers move to the new form and the old form is deleted in the same change. The enemy is a shim kept beside the new form, which lets every later change treat the codebase as append-only. The overcorrection is deleting a caller nobody inventoried, which breaks a consumer the search never found. Keeping both creates a dual path that slows every later change.

## Scope

- Covers a function, module path, class, route or type whose every caller lives in this repository.
- Does not cover persisted data, a stored or wire format, a published package or an endpoint another deployment calls; those keep compatibility on purpose, and `implementing-batch` migrates them in phases.
- A private package inside a monorepo counts as internal when the same change can update every consumer.

## Inventory the callers

1. Search the symbol and the import path across source, tests, scripts, docs, config and string literals; a rename misses a caller named inside a string.
2. List each caller with its file, then migrate them all before touching the old definition.
3. Delete the old definition, overload branch or re-export file, then search again: zero hits is the evidence the move finished.
4. Update the tests to call the new form; delete a test that only protected the old implementation detail.

## When a caller is hard to move

| Pressure | What holds |
|---|---|
| A line cap on the review | Migrating callers is mechanical and reviews fast; report that the cap cannot hold with the caller count, rather than hitting it with a shim. |
| Another team's open PR touches a caller | A one-line call-site change is a trivial rebase for them; tell them it lands, do not keep a second path for them. |
| "Callers move when someone next touches them" | That never happens; the old path becomes permanent. |
| A deadline | A shim ships the deadline and the debt; migrating ships the refactor. Say which one fits the time. |

## The one exception

An adapter kept on purpose needs all three: a named reason no in-repository change can remove, an owner, and a removal date written beside it. The user asking for it explicitly is such a reason. Without all three, it is a shim and goes.

## Judgment

- A zero-hit search outranks a caller list believed complete from memory; run it again after the delete.
- The one-exception's three conditions outrank a deadline or a line cap alone; missing any one of them makes it a shim.
- Scope decides first: a caller outside this repository keeps compatibility on purpose, never this file's delete-in-place rule.
