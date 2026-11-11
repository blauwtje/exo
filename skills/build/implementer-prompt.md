# Implementer prompt

The build session dispatches the `exo:build-task` agent for one task; it writes its report, at most 25 lines, to `Report to:`. `next-task.mjs` prints this block filled as `Prompt:`, which the build session pastes verbatim; fill it by hand only for a redispatch. Fill every field below and paste nothing more: frame and task sit in the brief file. A task that raises a `verify/budgets.mjs` value adds one `Budget-raise: <id> <old> to <new>: <reason>` line per value to it, which land-task puts in the Land gate and the task commit.

- `<brief path>`: the `Brief:` line `next-task.mjs` printed for the task.
- `<plan path>`: absolute, often gitignored; read it only at that path, never resolved inside `<checkout>`.
- `<checkout>`: the run's checkout, or the task's own worktree inside a wave.
- `<report directory>`: `<checkout>/.exo`; an agent writes nothing outside its own checkout.

```text
Task <n> of <plan path>, branch <branch>, checkout <checkout>.
Read your brief at <brief path>.
Report to: <report directory>/implementer-<n>.md
Return: one line
```

Every dispatch keeps `Return: one line`, so no report body reaches the dispatcher.

The `Commit:` block is the caller's, never the agent's.
