# Review brief

- Raise `<effort>` to `high` when the plan crosses a security boundary or a persisted format, and never pick `xhigh`, `max` or `ultra` unless the user asks.
- Name the plan path and ask it to check the diff against the plan's Decisions and Acceptance.
- Ask it to check the diff against the bullets under `Review focus:`, when `next-task.mjs` printed them.
- Ask it to read the test-file diffs first.
- Ask it to check each line the landing reports listed under `Removed test lines:`.
- Ask it to look for what a passing Proof hides: unseen inputs, unhandled parameters, needless complexity.
- Ask it to check the changed files against the Design and Change rules of the code rules; a file or function past the size smell is a nit.
- Ask it to skip style and formatting, because the project's lint and formatter decide them and a reviewer asked to find problems always finds something.
- Ask it to write each finding's evidence before its verdict line and to put the status line last, because a verdict written first turns the evidence into a justification.
- Ask it to list every default, fallback or filled-in value the diff adds and say what input makes it fire, because a silent default hides a wrong assumption.
