# Quality review brief

The text `implementing` hands `quality-reviewer` after `spec-reviewer` returns PASS. The reviewer judges the code against the standard, never the plan.

```text
Checkpoint <id>, repository <root>, spec review PASS.
Diff: git diff -- <the Touches: paths>
Standard: <path of the code standard the user's rules or the repository name, else the repository's CLAUDE.md conventions>

Check the diff for: names that are full words, one action per line, no abstraction that only forwards, no copied block, failures handled at their boundary, no comment that tells the change's story, tests where the standard demands them.

Verdict first, PASS or BLOCK, then at most ten findings with file:line and the rule each breaks, at most 25 lines.
```
