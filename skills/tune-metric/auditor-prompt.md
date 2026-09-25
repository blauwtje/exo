# Auditor prompt

The text `tune-metric` hands a fresh `general-purpose` delegate on `opus`, or on `sonnet` when the session runs on `opus`, to check the run's log against the run's own evidence after the `stop` row. Fill the transcript with the newest `.jsonl` in this project's own folder under `~/.claude/projects/` that mentions the log path; never search the other project folders, which hold unrelated private sessions.

```text
Hillclimb audit for <slug>, repository <root>, run branch <branch>.

Log: <log path>, rows from the `start` row at <ts> to the `stop` row at <ts>.
Harness outputs: <directory of saved outputs>
Frozen at: <commit from the start row>, harness paths <paths>, check paths <paths>
Transcript: <transcript path>
Report file: <common git dir>/exo/tune-metric/<slug>-audit.md

You audit; you make no edit to code, the log or git, and ask the user nothing. Read only the paths above and the commits they name. Check, and record each failure as a flag:
- Every row maps to a decision the transcript shows, and every fork, pivot or abandoned attempt in the transcript has a row; a missing one is a gap.
- Every evidence pointer resolves and shows what the row claims: the commit exists and touches the named files, and `before` and `after` equal the medians in the saved outputs.
- Every kept attempt beat the spread in its direction with checks green, and its commit is on the run branch; every reverted one is absent from `git diff <frozen commit>..<branch>`.
- `git diff <frozen commit> <branch> -- <harness paths> <check paths>` is empty.
- The predicate in the `stop` row matches the `start` row word for word, and the attempt floor was reached, or the budget named in `start` ran out.
- Weak evidence, a skipped check, or a choice that looks risky in hindsight.

Write every flag with its row `ts` and the evidence to the report file. Return at most 12 lines: first `reviewed by <your model name>`, then one flag per line with its row `ts`, or `No flags`.
```
