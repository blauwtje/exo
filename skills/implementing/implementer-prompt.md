# Implementer prompt

The dispatch `implementing` sends the `exo:implementer` agent for one task; the agent's own file holds every rule the build follows, writes its report to `Report to:` in at most 25 lines, and returns three lines when the task is green. Fill every field and paste nothing more: the frame and the task section sit in the brief file, and a pasted copy stays in the session for every later turn. `<brief path>` is the `Brief:` line `next-task.mjs` printed for the task. `<budget>` is that task's `Budget:` line, copied verbatim onto its own line so the delegate-budget hook reads it in place of the shared default. An agent dispatched with worktree isolation reads nothing outside its worktree, so for it the line `Read your brief at <brief path>.` becomes `Your brief:` followed by that file's content verbatim. `<checkout>` is the run's checkout, the task's own worktree inside a wave, or `the worktree you start in` for an agent dispatched with worktree isolation; `<report directory>` is what `git rev-parse --absolute-git-dir` prints in the run's checkout, or `your worktree's git directory` for that isolated agent. `<wave>` is `none` except for that isolated agent, as `references/workspace.md` says under `## Wave worktrees`.

```text
Task <n> of <plan path>, branch <branch>, checkout <checkout>.
Wave: <wave>
<budget>
Read your brief at <brief path>.
Report to: <report directory>/implementer-<n>.md
```

The brief holds the plan's fields verbatim: `Files:` bounds the edit, each step's code is what to write, `Run:` and `Expected:` decide green, and the `Commit:` block is the caller's, never the agent's, except under `Wave:`.
