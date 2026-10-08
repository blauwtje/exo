# One-task mode

`build <plan> --task <n>` lands task `<n>` in this session and asks the user nothing. `run-plan.mjs` starts one such session per task.

- Run each command as its own Bash call, spelled as the plan or skill gives it, with no `$( )`, `;`, `&&`, redirect or heredoc, because the run's allowlist denies anything else and a denial stops the task.
- Create and change files only with the Write and Edit tools, and read them with the Read tool.
- Work in the current checkout: run `git rev-parse --show-toplevel` alone and use the printed path literally as `<checkout>`.
- Ask nothing: a choice you cannot rule is `BLOCKED`; a reversible one you take on its recommended option is a `Decision: <clause>` line in the report, in place of `Choice:`.
- Dispatch no agent; run no `start-run.mjs`, worktree, tail or `ship`.
- Push nothing, and never run `land-task.mjs --fix`.

## Steps

1. **Ask the branch.** Run `node "${CLAUDE_SKILL_DIR}/scripts/next-task.mjs" --plan <plan> --root <checkout>`.
   - The line must be `Next: Task <n>`, or a `Wave:` line whose first task is `<n>`; any other line is `BLOCKED` with that line as the reason.
   - A `PLAN DRIFT:` line for task `<n>` is `BLOCKED PLAN DRIFT: <item>`.
2. **Build.** Read the task's `Brief:` file, then build it per `${CLAUDE_SKILL_DIR}/../../agents/build-task.md` in this session.
   - A task whose `Design:` is not `none` builds instead by steps 1-3 of `${CLAUDE_SKILL_DIR}/references/design-tasks.md` `## The delegate`, in this session, contract first, with `$RUN` as `<checkout>/.exo`.
   - Its `Report to:` is `<checkout>/.exo/implementer-<n>.md`.
   - Its `Return:` lines do not apply: step 4 sets the last line.
   - Stop at its `## Stop` conditions as `BLOCKED <reason>`, the report path in the reason.
3. **Land.** Run `node "${CLAUDE_SKILL_DIR}/scripts/land-task.mjs" --plan <plan> --task <n> --root <checkout>`.
   - A refusal, a `PLAN DRIFT` line or a non-zero exit is `BLOCKED <first output line>`.
   - A `Pending: mcp:` line is `BLOCKED mcp proof`.
4. **End on one line**, the last of the reply, nothing after it.
   - `Task <n>: LANDED <sha>`, the sha from `git rev-parse --short HEAD`.
   - `Task <n>: BLOCKED <reason>`, one clause.
