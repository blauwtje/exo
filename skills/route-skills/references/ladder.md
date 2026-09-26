# Right-sizing

This ladder keeps complexity low by reusing what exists; it holds before every edit adding or replacing code, with no skill call.

## The ladder

Read the changed ranges and trace control and data flow, then take the first rung that fits in one pass; when two rungs hold, the lower number wins, because comparing rungs overbuilds. Decide without asking; edit in the same turn.

1. **Need.** Build only for a use the request names today, first deleting the branch, duplicate or path it obsoletes; a later use stays out and is listed in the report.
2. **Reuse.** When a symbol, pattern or type in this repository already does the job, found with one search by name or role, reuse it rather than writing a second.
3. **Borrow.** Otherwise take the first source that does it: the standard library, a native platform feature, CSS over script or a database constraint over application code, then a dependency the manifest lists, with no new dependency for what ten lines cover.
4. **Write.** Then write it: the fewest statements the checks accept, one action per line, no call chained into a call into an index, full-word names, guard clauses over nesting.

## Never on the ladder

Trust-boundary checks, failure handling that prevents data loss, what security depends on, accessibility, and every part the user named are built completely on any rung. A shortcut with a known limit carries one comment naming it and how to lift it.
