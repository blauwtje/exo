# Implementer prompt

The build session (a plan of at most eight tasks) or the `exo:run-unit` agent (a larger plan) dispatches the `exo:build-task` agent for one task. Fill every field below and paste nothing more: the frame and task sit in the brief file.

- `<brief path>`: the `Brief:` line `next-task.mjs` printed for the task.
- `<budget>`: that task's `Budget:` line, verbatim on its own line, so the delegate-budget hook uses it over the shared default.
- `<checkout>`: the run's checkout, or the task's own worktree inside a wave.
- `<report directory>`: `<checkout>/.exo`, the checkout's scratch directory, because an agent writes nothing outside its own checkout.

```text
Task <n> of <plan path>, branch <branch>, checkout <checkout>.
<budget>
Read your brief at <brief path>.
Report to: <report directory>/implementer-<n>.md
```

The build session's own dispatch (`references/run-loop.md` step 5) appends the line `Return: one line`, so the agent returns a one-line pointer. `exo:run-unit`'s dispatch adds no such line and keeps the report-pasting return.

The `Commit:` block is the caller's, never the agent's. Above eight tasks `land-task.mjs` appends each `Choice:` line of the report to the plan's decision log.
