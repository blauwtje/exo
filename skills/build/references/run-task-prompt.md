# Builder prompt

Land Task <n> of the plan you are given by path. Read Task <n> and the plan's Goal, Decisions, Non-goals and Facts from the plan file, and follow these rules.

- Work in the checkout you were given: start each command with `cd <checkout> &&` and give Edit and Write absolute paths. Change only the files the task lists; when another file must change, such as a registry or index, stop with `BLOCKED <file> is missing from the file list`.
- Prove first: see the task's Proof fail, make the change, see it pass. Rewrite a test that passes without the behaviour it claims to guard. Add no sleep, retry or rerun to make a Proof pass.
- A Proof that passes before your change proves nothing. When it does, or when `land-task.mjs` refuses the task because a changed test file passes without the production change, stop with `Task <n>: BLOCKED proof <command> did not fail first`, unless the task says `Red: none`.
- Change nothing outside the task's scope, not even a bug you see: write each such issue as one `Noticed: <issue> (<path:line>)` line in the report, else `Noticed: none`.
- Write the report with Write to the report path the dispatch gives before landing. `land-task.mjs` reads the proof from it, in this layout:

```
Landed: <change>
Test first: yes, <category> | no
Red: <test command>: fail | none, <why>
  <assertion and observed value>
Proof:
<command>: pass
  <last output lines>
Unresolved: none
Noticed: none
```

- Run the land command your agent body gives, with `--plan <plan> --task <n> --root <checkout>`, after your last edit. Fix what it refuses inside the task's files and rerun.
- A `Deferred:` brief line names a Proof only the session can run. Skip it and write `<command>: deferred`.
- With no `Proof:`, pick or write one test for `Success criterion:`, run only it, and list it first under Proof.
- In a long task, code each step. Green is each `Run:` printing `Expected:`.
- Push nothing, and start no worktree.
- Only an irreversible write or a file outside the list ends the reply with `BLOCKED <n> NEEDS ANSWER: <question> (A) <option> (B) <option> Recommended: (A), because <reason>`, with 2 to 3 options.
- With `Chain: <k>` in the dispatch, land your task, then run `next-task.mjs` (the path the dispatch gives) and land the printed `Next:` task the same way, up to `<k>` tasks, each with its own `implementer-<n>.md` report and `land-task.mjs` call. Read the plan once; for each later task read the `Brief:` path `next-task.mjs` prints, not the plan again. Take each later report path from the `Report:` line `next-task.mjs` prints, and list every report path on your `Report:` line. Stop at the first non-GREEN task and end with one status line per task tried.
- Reply with `Report: <the report path the dispatch gives>` and nothing else but the last line (one per task in a chain), which is `Task <n>: GREEN`, `Task <n>: BLOCKED <reason>` or `Task <n>: PLAN DRIFT <reason>`.
