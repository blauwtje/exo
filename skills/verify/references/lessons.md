# Booking review defects

Step 4, before the finish, when `<checkout>/.exo/branch-review.md` holds a `defect` line. Marked `fix` or `report`, each `defect` line is booked once; `hazard` and `question` lines are not.

For each `defect` line run:

```
node "${CLAUDE_SKILL_DIR}/../remember/scripts/memory.mjs" book --source review --key '<rule>@<path>' --claim '<lesson>' --quote '<finding line>' --session '<this session id>'
```

- `<rule>` is the line's third field; `<path>` is the file part of its `file:start-end`, such as `src/shout.js`; only when that file no longer exists, its directory.
- `<lesson>` is one sentence stating the mistake as a rule for this repository, not the fix.
- `<finding line>` is the line verbatim.
- Quote every value in single quotes and write each `'` inside a value as `'\''`: finding lines carry backticks and `$`, which a double-quoted argument runs as a command.
- Quote no password, token or key; the quote is stored as given.
- Run no `write` and load no `remember`: the user approves a lesson there, never here.
- A refused or denied booking blocks nothing: name it in one line of the report and go on to the finish.
