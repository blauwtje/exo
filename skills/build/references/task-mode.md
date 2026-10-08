# One-task mode

`build <plan> --task <n>` lands task `<n>` in this session and asks the user nothing. `run-plan.mjs` starts one such session per task.

- Ask nothing: a choice you cannot rule is `BLOCKED`.
- Dispatch no agent; run no `start-run.mjs`, worktree, tail or `ship`.
- Work in the current checkout, `git rev-parse --show-toplevel`, called `<checkout>`.
- Push nothing, and never run `land-task.mjs --fix`.

## Steps

1. **Ask the branch.** Run `node "${CLAUDE_SKILL_DIR}/scripts/next-task.mjs" --plan <plan> --root <checkout>`.
   - The line must be `Next: Task <n>`, or a `Wave:` line whose first task is `<n>`; any other line is `BLOCKED` with that line as the reason.
   - A `PLAN DRIFT:` line for task `<n>` is `BLOCKED PLAN DRIFT: <item>`.
2. **Build.** Read the task's `Brief:` file, then build it per `${CLAUDE_SKILL_DIR}/../../agents/build-task.md` in this session.
   - Its `Report to:` is `<checkout>/.exo/implementer-<n>.md`.
   - Its `Return:` lines do not apply: step 4 sets the last line.
   - Stop at its `## Stop` conditions as `BLOCKED <reason>`, the report path in the reason.
3. **Land.** Run `node "${CLAUDE_SKILL_DIR}/scripts/land-task.mjs" --plan <plan> --task <n> --root <checkout>`.
   - A refusal, a `PLAN DRIFT` line or a non-zero exit is `BLOCKED <first output line>`.
   - A `Pending: mcp:` line is `BLOCKED mcp proof`.
4. **End on one line**, the last of the reply, nothing after it.
   - `Task <n>: LANDED <sha>`, the sha from `git rev-parse --short HEAD`.
   - `Task <n>: BLOCKED <reason>`, one clause.
