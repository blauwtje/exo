# Implementer prompt

`run-plan` dispatches `exo:build-task` for one task; its own file holds every build rule and writes its report, at most 25 lines, to `Report to:`. Fill every field below and paste nothing more: the frame and task sit in the brief file, not this prompt.

- `<brief path>`: the `Brief:` line `next-task.mjs` printed for the task.
- `<budget>`: that task's `Budget:` line, verbatim on its own line, so the delegate-budget hook uses it over the shared default.
- `Read your brief at <brief path>.`: for an agent dispatched with worktree isolation, which reads nothing outside its worktree, use `Your brief:` followed by the file's content instead.
- `<checkout>`: the run's checkout, the task's own worktree inside a wave, or `the worktree you start in` for an isolated agent.
- `<report directory>`: `<checkout>/.exo`, the checkout's scratch directory, because an agent writes nothing outside its own checkout.
- `Report to:` for an isolated agent reads `Report to: your final message`, because the harness removes an isolated worktree with no commit, report file included, when the agent ends.
- `<wave>`: `none`, except for an isolated agent, per `references/wave-worktrees.md`.

```text
Task <n> of <plan path>, branch <branch>, checkout <checkout>.
Wave: <wave>
<budget>
Read your brief at <brief path>.
Report to: <report directory>/implementer-<n>.md
```

The brief holds the plan's fields verbatim: `Files:` bounds the edit, each step's code is what to write, `Run:` and `Expected:` decide green. The `Commit:` block is the caller's, never the agent's, except under `Wave:`.
