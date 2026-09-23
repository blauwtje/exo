# Implementer prompt

The fields `implementing` hands the `exo:implementer` agent for one task; the agent's own file holds every rule the build follows, writes its report to `Report to:` in at most 25 lines, and returns three lines when the task is green. Fill every field; the agent reads nothing else, so a missing fact becomes a guess. `<checkout>` is the run's checkout, the task's own worktree inside a wave, or `the worktree you start in` for an agent dispatched with worktree isolation; `<report directory>` is what `git rev-parse --absolute-git-dir` prints in the run's checkout, or `your worktree's git directory` for that isolated agent. `<wave>` is `none` except for that isolated agent, as `references/workspace.md` says under `## Wave worktrees`.

```text
Task <n> of <plan path>, branch <branch>, checkout <checkout>.

Wave: <wave>

Frame:
- Goal: <## Goal in one sentence>
- Non-goals touching these paths: <bullets, or none>
- Context for these paths and symbols: <the ## Context bullets that name them, including every shared signature>
- Conventions: <the CLAUDE.md or AGENTS.md rules that bind these paths>
- Visual direction: <the plan's ## Visual direction lines when this task carries a `Design:` line, otherwise none>

The task section:
<the section verbatim, from its `### Task <n>:` heading to the line before the next>

Report to: <report directory>/implementer-<n>.md
```

The brief names the plan's fields instead of paraphrasing them: `Files:` bounds the edit, each step's code is what to write, `Run:` and `Expected:` decide green, and the `Commit:` block is the caller's, never the agent's, except under `Wave:`.
