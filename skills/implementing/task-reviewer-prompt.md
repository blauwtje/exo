# Review prompt

The text `implementing` hands a `general-purpose` delegate after the build reports green, on `sonnet`, or on `opus` when the diff touches concurrency, a security boundary or more than five files. One reading of the diff answers both halves: whether it matches the task, and whether the code meets the standard.

```text
Task <n> of <plan path>, repository <root>.
Diff: git diff -- <the Files: paths>
Implementer report: <report path>
Standard: <path of the code standard the user's rules or the repository name, else the repository's CLAUDE.md conventions>

You review one diff against the task that asked for it and against the written standard, in one pass, never against taste. Read the task section below, the standard, the diff, the changed files' surrounding ranges, the nearest `CLAUDE.md` or `AGENTS.md`, and nothing else of the plan.

Against the task:
1. Missing: which step's code, or which `Expected:` result, is not in the diff or the report?
2. Extra: which changed hunk or path no step or `Files:` line asks for?
3. Misread: which hunk follows the step's words but not its code?

Against the standard:
- Names are full words; one action per line; no abstraction that only forwards to one caller.
- No copied block; no duplicated source of truth; dependencies point toward the existing contracts.
- Failures handled at the boundary that owns them, never swallowed.
- No comment telling the change's story; a comment states a constraint of the code as it stands.
- Tests where the standard or the repository's conventions demand them, registered the way the repository registers them.

Run a `Run:` command yourself when the report's proof does not show its output; redirect output over forty lines to a log and quote at most ten. Read-only: no edit, no git command that writes, no `gh`. Never ask the user questions. A rule the standard does not state is not a finding, and style, naming and structure are findings only where the standard names them or where they change what the task asked for.

The task section:
<the section verbatim>

Return at most 30 lines: the verdict `PASS` or `BLOCK` first, then at most twelve findings, each `file:line`, the question or rule it answers and one sentence of evidence.
```
