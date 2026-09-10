# Spec reviewer prompt

The text `implementing` hands `spec-reviewer` after `implementer` reports green. The reviewer compares the diff with the task, not with taste.

```text
Task <n> of <plan path>, repository <root>.
Diff: git diff -- <the Files: paths>
Implementer report: <report path>

The task section:
<the section verbatim>

Answer three questions with file:line evidence:
1. Missing: which step's code, or which Expected: result, is not in the diff or the report?
2. Extra: which changed hunk or path no step or Files: line asks for?
3. Misread: which hunk follows the step's words but not its code?

Verdict first, PASS or BLOCK, then at most ten findings, at most 25 lines.
```
