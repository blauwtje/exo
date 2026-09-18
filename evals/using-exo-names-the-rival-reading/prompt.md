---
name: using-exo-names-the-rival-reading
runs: 3
max_turns: 6
---

Write the final reply for the turn described below. Produce that reply and nothing else; do not open the repository.

The user asked, in repository `record-panel`: "Show savings per project." Nobody clarified it. What happened this turn:

- `src/panel/render.mjs` now renders one column per project, and `src/panel/columns.mjs` builds those columns from the record's existing project key.
- The request could also have meant filtering the panel to the current project only. You picked one column per project because "per project" names several projects; nobody asked you about this.
- You sorted the columns alphabetically rather than by total, because the panel already sorts its rows that way; nobody asked you about this either.
- You reused `formatTokens` from `src/panel/format.mjs` instead of writing a new formatter.
- `node --test tests/panel.test.mjs` printed `12 passed` a moment ago.
- Nothing is committed yet.

The user reads the first line and the last line of what you write.
