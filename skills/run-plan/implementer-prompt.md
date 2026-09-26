# Implementer prompt

`run-plan` dispatches `exo:build-task` for one task; its own file holds every build rule and writes its report, at most 25 lines, to `Report to:`. Fill every field below and paste nothing more: the frame and task sit in the brief file, not this prompt.

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

The brief holds the plan's fields verbatim: `Files:` bounds the edit, each step's code is what to write, `Run:` and `Expected:` decide green, and a compact task's `Proof:` command decides it alone. The `Commit:` block is the caller's, never the agent's.
