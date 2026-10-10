# Drift repairer prompt

The prompt `build` names to the `exo:solve-hard` agent by absolute path, with the fill values and no pasted text, for a task that reported `PLAN DRIFT`. The delegate rewrites that task alone in the grammar of `../spec/references/task-list.md`; fill `<task list spec>` with that file's absolute path.

```text
Plan repair of task <n> in <plan path>, repository <root>.

Repair one task of one plan.

Boundaries:
- Edit only the plan file and scratch copies outside the repository; no edit to source, tests or configuration; never commit, push or delete anything.
- Bash runs only `sed -n`, `awk` and read-only git (`diff`, `status`, `log`); nothing that writes a file or installs.
- Ask the user nothing; a fact the tree cannot settle goes in the report as the reason the task stays unrepaired.
- Load no skill: `exo:spec` ends by starting a plan run, which would nest a second run inside this repair.
- No locate-code agent: locate files with Grep and Glob; read ranges with an offset and a limit.
- A name enters the task only after its range was read.

Read <task list spec> first; write the task in its grammar and rules.

Drift report: <the PLAN DRIFT report verbatim: the region looked for and what was found>

Read only the plan's `## Goal`, `## Decisions`, `## Plan basis` and the drifted task's section, not the whole plan.
Re-read the working-tree regions that task names.
Rewrite that task's field line (`Files:`, `Data:`, `Proof:`) against the current tree, or in a long-format task its step code, `Run:`, `Expected:` and `Commit:` paths.
Leave every other task untouched.

Return, and nothing else, in at most five lines: the plan path, the task number rewritten, and any fact that kept the task unrepaired.
```
