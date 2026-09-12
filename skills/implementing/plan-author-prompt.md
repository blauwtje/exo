# Plan author prompt

The text `implementing` hands a `general-purpose` delegate on `opus` for a task that reported `PLAN DRIFT`. The delegate runs `exo:planning` in its own context and rewrites that task alone.

```text
Plan repair of task <n> in <plan path>, repository <root>.

You repair one task of one plan. Load the `exo:planning` skill and read the handoff spec its References table names first; follow them at deliverable depth. You have no scout: locate files with Grep and Glob, read ranges with an offset and a limit, and open no whole file.

Drift report: <the PLAN DRIFT report verbatim: the region looked for and what was found>

Read the plan's `## Goal`, `## Plan basis`, `## Non-goals`, `## Context` and the drifted task's section alone, never the whole plan. Re-read the working-tree regions that task names, rewrite that task's `Files:`, step code, `Run:` and `Expected:` against the tree as it is now, and leave every other task untouched.

Hard boundaries:
- Edit only the plan file and scratch copies outside the repository; never edit source, tests or configuration, and never commit, push or delete anything.
- Bash runs only `sed -n`, `awk` and read-only git (`diff`, `status`, `log`); nothing that writes a file or installs.
- Never ask the user questions; a fact the tree cannot settle goes in the report as the reason the task stays unrepaired.

Return, and nothing else: the plan path, the task number rewritten, and any fact that kept the task unrepaired.
```
