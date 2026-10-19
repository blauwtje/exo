# Implementer prompt

The `exo:run-unit` agent, or the build session on the direct route, dispatches the `exo:build-task` agent for one task; it writes its report, at most 25 lines, to `Report to:`. `next-task.mjs` prints this block filled as `Prompt:`, which `exo:run-unit` pastes verbatim; fill it by hand only for a redispatch. Fill every field below and paste nothing more: frame and task sit in the brief file.

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

Every dispatch keeps `Return: one line`, `exo:run-unit`'s included, so no report body reaches the dispatcher.

The `Commit:` block is the caller's, never the agent's.
