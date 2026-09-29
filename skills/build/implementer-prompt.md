# Implementer prompt

The build session (a plan of at most eight tasks) or the `exo:run-unit` agent (a larger plan) dispatches the `exo:build-task` agent for one task; its own file holds every build rule and writes its report, at most 25 lines, to `Report to:`. Fill every field below and paste nothing more: the frame and task sit in the brief file, not this prompt.

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

The build session's own dispatch (`references/run-loop.md` step 5, a plan of at most eight tasks) appends one further line, `Return: one line`, so the agent returns a one-line pointer instead of pasting the report; `exo:run-unit`'s dispatch of a larger plan adds no such line and keeps the agent's report-pasting return.

The brief holds the plan's fields verbatim: `Files:` bounds the edit, each step's code is what to write, `Run:` and `Expected:` decide green, and a compact task's `Proof:` command decides it alone. The `Commit:` block is the caller's, never the agent's. Each `Choice: <one clause>` line of the report is a choice the task's fields left open; above eight tasks `land-task.mjs` appends it to the plan's decision log.
