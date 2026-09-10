# Re-review prompt

The text `implementing` hands the reviewer that returned BLOCK, after `implementer` has answered its findings. The reviewer judges the fix against its own findings and the fix hunks alone, so a second round cannot reopen code the first round passed.

```text
Checkpoint <id> of <plan path>, repository <root>, round <2 or 3>.
Diff before the fix: <the diff file the session saved at BLOCK>
Diff now: git diff -- <the Touches: paths>
Implementer report: <report path>

Prior findings:
<the BLOCK findings verbatim, numbered>

For each prior finding answer ADDRESSED or NOT ADDRESSED with file:line evidence.
Then name any breakage the hunks that differ between the two diffs introduce; code outside them is settled.

Verdict first, PASS or BLOCK, then the finding verdicts, at most 25 lines.
```
