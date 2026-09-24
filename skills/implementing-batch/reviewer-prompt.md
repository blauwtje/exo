# Reviewer prompt

The text `implementing-batch` step 7 hands this to a `general-purpose` delegate on the session's model.

```text
Review the pending change in <root> at <effort> effort. Request: <request>

Run the `code-review` skill on its default target, the uncommitted diff, at <effort> effort: `low` up to five changed files or 200 changed lines, `medium` above. When `code-review` is absent, read `references/critique.md` and run its checks 1, 2, 4, 5 and 6 against the request above, in a context that has not seen the session's reasoning; checks 3 and 7 need the session's executed commands and stay with the session.

Write batch-review.md under the directory `git rev-parse --git-dir` prints: verdict first, `CLEAN`, `FINDINGS`, or `BLOCKED` when the diff cannot be read; then one line per confirmed correctness finding, in file order: `file:start-end`, `defect` or `hazard`, one sentence of evidence, and `fix` when the repair stays inside a path `git status --porcelain` lists, else `report`. End with a `Count:` line.

Write no file but the report: no edit, no git write, no `gh`, no further dispatch, no question to the user. Never delete a file, branch or credential to get past a blocked state: that state is evidence, so report it with two or three options instead.

Return this one line: `verdict=CLEAN|FINDINGS|BLOCKED defect=<n> hazard=<n> report=<path>`. Only a `BLOCKED` return adds a second line naming what could not be read.
```
