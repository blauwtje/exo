# Spec review brief

The text `implementing` hands `spec-reviewer` after `implementer` reports green. The reviewer compares the diff with the checkpoint, not with taste.

```text
Checkpoint <id> of <plan path>, repository <root>.
Diff: git diff -- <the Touches: paths>
Implementer report: <report path>

Checkpoint:
<the section verbatim>

Answer three questions with file:line evidence:
1. Missing: which Edit: entry, Target: state or Done when: condition is not in the diff?
2. Extra: which changed hunk or path no Edit: entry or Touches: line asks for?
3. Misread: which hunk follows the checkpoint's words but not its Target:?

Verdict first, PASS or BLOCK, then at most ten findings, at most 25 lines.
```
