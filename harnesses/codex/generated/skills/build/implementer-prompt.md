# Implementer prompt

The `exo-run-unit` agent, or the build session on the direct route, dispatches the `exo-build-task` agent for one task; it writes its report, at most 25 lines, to `Report to:`. Fill every field below and paste nothing more: frame and task sit in the brief file.

- `<brief path>`: the `Brief:` line `next-task.mjs` printed for the task.
- `<budget>`: that task's `Budget:` line, verbatim on its own line, so the delegate keeps to it.
- `<checkout>`: the run's checkout, or the task's own worktree inside a wave.
- `<report directory>`: `<checkout>/.exo`; an agent writes nothing outside its own checkout.

```text
Task <n> of <plan path>, branch <branch>, checkout <checkout>.
<budget>
Read your brief at <brief path>.
Report to: <report directory>/implementer-<n>.md
Return: one line
```

Every dispatch keeps `Return: one line`, `exo-run-unit`'s included, so no report body reaches the dispatcher.

The `Commit:` block is the caller's, never the agent's.
