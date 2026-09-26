# Drift repairer prompt

The text `run-plan` hands a `general-purpose` delegate on `opus` for a task that reported `PLAN DRIFT`. The delegate rewrites that task alone in the grammar of define-scope's `references/task-list.md`; fill `<task list spec>` with that file's absolute path, the `define-scope/references/task-list.md` beside this skill's own folder.

```text
Plan repair of task <n> in <plan path>, repository <root>.

You repair one task of one plan. Read <task list spec> first and write the task in its grammar and rules. Load no skill: `exo:define-scope` ends by starting a plan run, which would nest a second run inside this repair. You have no locate-code agent: locate files with Grep and Glob, read ranges with an offset and a limit, and open no whole file; a name reaches the task only after its range was read.

Drift report: <the PLAN DRIFT report verbatim: the region looked for and what was found>

Read the plan's `## Goal`, `## Decisions`, `## Plan basis` and the drifted task's section alone, never the whole plan. Re-read the working-tree regions that task names, rewrite that task's field line (`Files:`, `Data:`, `Proof:`) against the tree as it is now, or in a long-format task its step code, `Run:`, `Expected:` and `Commit:` paths, and leave every other task untouched.

Hard boundaries:
- Edit only the plan file and scratch copies outside the repository; never edit source, tests or configuration, and never commit, push or delete anything.
- Bash runs only `sed -n`, `awk` and read-only git (`diff`, `status`, `log`); nothing that writes a file or installs.
- Never ask the user questions; a fact the tree cannot settle goes in the report as the reason the task stays unrepaired.

Return, and nothing else, in at most five lines: the plan path, the task number rewritten, and any fact that kept the task unrepaired.
```
